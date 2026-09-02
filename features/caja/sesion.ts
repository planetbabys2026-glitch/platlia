import "server-only";
import { sesionDeCobro, type ResultadoSesionDeCobro } from "@/features/caja/reglas";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * En qué turno cae la plata de este cobro, preguntado contra la base.
 *
 * Vive suelto —y no en `queries.ts`— porque lo llaman desde adentro de una
 * transacción: el cobro decide su caja en el mismo commit en que escribe el pago,
 * o entre las dos cosas alguien podría cerrar el turno y el `OrderPayment`
 * quedaría colgado de una sesión cerrada.
 *
 * La regla está en `features/caja/reglas.ts`, pura y con tests; acá solo se le
 * trae la lista de turnos abiertos.
 */
type Transaccion = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

export async function elegirSesionDeCobro(
  tx: Transaccion,
  userId: string,
): Promise<ResultadoSesionDeCobro> {
  const abiertas = await tx.cashSession.findMany({
    where: { status: "ABIERTA" },
    select: { id: true, openedById: true, cashRegister: { select: { name: true } } },
  });

  return sesionDeCobro(
    abiertas.map((s) => ({
      id: s.id,
      openedById: s.openedById,
      cajaNombre: s.cashRegister.name,
    })),
    userId,
  );
}

/**
 * El texto para quien no tiene dónde poner la plata.
 *
 * Los dos casos se resuelven distinto y por eso no comparten mensaje: sin
 * ninguna caja abierta hay que abrir el turno; con varias abiertas y ninguna
 * propia, el sistema se niega a adivinar de quién es el cajón —meter la venta en
 * el arqueo de otro es un faltante que paga quien no lo hizo—.
 */
export function mensajeSinSesion(
  motivo: "SIN_CAJA" | "VARIAS_Y_NINGUNA_TUYA",
  que = "recibir un pago",
): string {
  return motivo === "SIN_CAJA"
    ? `No hay caja abierta: no se puede ${que}.`
    : `Hay varias cajas abiertas y ninguna es tuya. Abrí tu turno para ${que}.`;
}
