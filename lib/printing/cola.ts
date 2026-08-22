import "server-only";
import { PrintJobStatus, PrinterRole } from "@/generated/prisma/enums";
import type { TenantDb } from "@/lib/db/tenant";
import { aBase64, componerEscPos } from "@/lib/printing/escpos";
import { publicarImpresion } from "@/lib/redis";

/**
 * La cola de impresión.
 *
 * **La cola es durable y vive en Postgres. Redis es el timbre, no la cola.**
 * Pub/Sub es fire-and-forget: lo que se publica mientras el agente del local está
 * apagado se pierde y nadie se entera. Para un contador de pantalla eso está
 * bien; para una comanda no. Así que el trabajo se escribe primero y el aviso se
 * manda después del commit; si el aviso se pierde, el agente lo encuentra igual
 * en su próxima vuelta.
 *
 * El mismo patrón que ya usa `app/api/avisos/stream`: snapshot al conectar más
 * reconciliación periódica, en vez de confiar en haber estado escuchando.
 */

type Db = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

/** Cuánto vale un reclamo antes de que el trabajo vuelva a la cola. */
export const MINUTOS_DE_RECLAMO = 2;

/** Cuántas veces se reintenta antes de dar el trabajo por perdido y avisar. */
export const INTENTOS_MAXIMOS = 3;

export type TrabajoParaEncolar = {
  printerId: string;
  orderId?: string | null;
  tipo: "RECIBO" | "COMANDA" | "PRUEBA";
  lineas: readonly string[];
  lineasDestacadas?: number;
  abrirCajon?: boolean;
};

/**
 * Deja el trabajo en la cola. **Se llama dentro de la transacción que lo originó.**
 *
 * Encolar fuera de la transacción abriría la puerta a imprimir un recibo de una
 * venta que después no se guardó.
 */
export async function encolarImpresion(
  db: Db,
  businessId: string,
  trabajo: TrabajoParaEncolar,
): Promise<string> {
  const bytes = componerEscPos({
    lineas: trabajo.lineas,
    lineasDestacadas: trabajo.lineasDestacadas ?? 0,
    abrirCajon: trabajo.abrirCajon ?? false,
  });

  const job = await db.printJob.create({
    data: {
      businessId,
      printerId: trabajo.printerId,
      orderId: trabajo.orderId ?? null,
      tipo: trabajo.tipo,
      payload: aBase64(bytes),
      // La copia legible es para soporte: nadie va a decodificar base64 para
      // entender por qué se descuadró una columna.
      vistaPrevia: trabajo.lineas.join("\n"),
    },
    select: { id: true },
  });

  return job.id;
}

/**
 * A qué impresora va cada cosa.
 *
 * El recibo va a la impresora de recibos; la comanda, a la que tenga asignada su
 * estación. `Product.kitchenStation` es texto libre y el KDS ya agrupa por ese
 * string, así que el mapa se hace por nombre y "Sin estación" —el nombre canónico
 * que ya usa `features/cocina/queries.ts`— cae en la impresora de comandas por
 * defecto.
 */
export async function impresoraDeRecibos(db: Db): Promise<{ id: string; width: string; abreCajon: boolean } | null> {
  return db.printer.findFirst({
    where: { rol: PrinterRole.RECIBO, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, width: true, abreCajon: true },
  });
}

export async function impresoraDeEstacion(
  db: Db,
  estacion: string,
): Promise<{ id: string; width: string } | null> {
  const ruta = await db.printRoute.findFirst({
    where: { stationName: estacion },
    select: { printer: { select: { id: true, width: true, active: true } } },
  });
  if (ruta?.printer?.active) return { id: ruta.printer.id, width: ruta.printer.width };

  // Sin ruta explícita, cae en la primera impresora de comandas: es preferible
  // que el papel salga en el lugar equivocado a que no salga.
  const porDefecto = await db.printer.findFirst({
    where: { rol: PrinterRole.COMANDA, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, width: true },
  });
  return porDefecto;
}

/**
 * El timbre. Se toca DESPUÉS del commit.
 *
 * Antes del commit, el agente podría llegar a buscar el trabajo y no encontrarlo
 * todavía —y entonces no volvería hasta su próxima ronda—.
 */
export function avisarAlAgente(businessId: string): void {
  void publicarImpresion(businessId);
}

/** Un trabajo tal como lo recibe el agente. */
export type TrabajoReclamado = {
  id: string;
  tipo: string;
  payload: string;
  intentos: number;
  impresora: { id: string; nombre: string; host: string; port: number };
};

/**
 * Le entrega al agente hasta `limite` trabajos y se los reserva.
 *
 * El reclamo es la misma guarda que la emisión DIAN: un `updateMany` condicionado
 * que solo gana uno, y que **caduca**, para que un agente que se muere con el
 * trabajo en la mano no lo bloquee para siempre. Dos agentes corriendo —una PC en
 * la caja y otra en la cocina— no pueden imprimir el mismo recibo dos veces.
 */
export async function reclamarTrabajos(
  db: Db,
  agenteId: string,
  limite = 10,
): Promise<TrabajoReclamado[]> {
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + MINUTOS_DE_RECLAMO * 60_000);

  const candidatos = await db.printJob.findMany({
    where: {
      OR: [
        { estado: PrintJobStatus.PENDIENTE },
        // Lo que quedó reclamado por un agente que ya no está.
        { estado: PrintJobStatus.RECLAMADO, reclamadoHasta: { lt: ahora } },
      ],
      intentos: { lt: INTENTOS_MAXIMOS },
      printer: { active: true },
    },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: { id: true },
  });

  const reclamados: TrabajoReclamado[] = [];

  for (const candidato of candidatos) {
    // Condicionado sobre el estado que se leyó: si otro agente se lo llevó entre
    // el `findMany` y esto, el `count` es 0 y se saltea sin pelear.
    const { count } = await db.printJob.updateMany({
      where: {
        id: candidato.id,
        OR: [
          { estado: PrintJobStatus.PENDIENTE },
          { estado: PrintJobStatus.RECLAMADO, reclamadoHasta: { lt: ahora } },
        ],
      },
      data: {
        estado: PrintJobStatus.RECLAMADO,
        reclamadoPor: agenteId,
        reclamadoHasta: hasta,
      },
    });
    if (count === 0) continue;

    const job = await db.printJob.findFirst({
      where: { id: candidato.id },
      select: {
        id: true,
        tipo: true,
        payload: true,
        intentos: true,
        printer: { select: { id: true, name: true, host: true, port: true } },
      },
    });
    if (!job) continue;

    reclamados.push({
      id: job.id,
      tipo: job.tipo,
      payload: job.payload,
      intentos: job.intentos,
      impresora: {
        id: job.printer.id,
        nombre: job.printer.name,
        host: job.printer.host,
        port: job.printer.port,
      },
    });
  }

  return reclamados;
}

/** El agente confirma que el papel salió. */
export async function marcarImpreso(db: Db, jobId: string, agenteId: string): Promise<boolean> {
  const { count } = await db.printJob.updateMany({
    where: { id: jobId, reclamadoPor: agenteId },
    data: {
      estado: PrintJobStatus.IMPRESO,
      impresoEn: new Date(),
      ultimoError: null,
      reclamadoHasta: null,
    },
  });
  return count > 0;
}

/**
 * El agente reporta que no pudo.
 *
 * Vuelve a `PENDIENTE` para que otro lo tome, salvo que se hayan agotado los
 * intentos: ahí queda en `ERROR` y hay que avisarle a alguien, porque un papel
 * que no salió en silencio es un cliente esperando.
 */
export async function marcarFallo(
  db: Db,
  jobId: string,
  agenteId: string,
  error: string,
): Promise<{ agotado: boolean; intentos: number } | null> {
  const job = await db.printJob.findFirst({
    where: { id: jobId, reclamadoPor: agenteId },
    select: { id: true, intentos: true },
  });
  if (!job) return null;

  const intentos = job.intentos + 1;
  const agotado = intentos >= INTENTOS_MAXIMOS;

  await db.printJob.update({
    where: { id: job.id },
    data: {
      intentos,
      ultimoError: error.slice(0, 500),
      estado: agotado ? PrintJobStatus.ERROR : PrintJobStatus.PENDIENTE,
      reclamadoPor: null,
      reclamadoHasta: null,
    },
  });

  return { agotado, intentos };
}
