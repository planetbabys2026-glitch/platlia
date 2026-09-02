import "server-only";
import { tenantDb } from "@/lib/db/tenant";
import { diasDeLaDeudaMasVieja, saldoTotal } from "@/features/cartera/reglas";

/**
 * La cartera: quién debe, cuánto y desde cuándo.
 *
 * Se trae entera y se ordena en memoria, como el historial de cuentas cobradas:
 * es el conjunto de deudores con saldo de un negocio —decenas, no miles—, y la
 * antigüedad de la deuda más vieja es una derivación de los fiados que SQL no
 * sabe hacer sin una subconsulta por fila.
 */

/** Tope de deudores que trae la pantalla, para no prometer una lista sin fin. */
export const TOPE_DEUDORES = 300;

export async function getCartera(businessId: string) {
  const db = tenantDb(businessId);

  const deudores = await db.deudor.findMany({
    where: { deletedAt: null, fiados: { some: { saldoCop: { gt: 0 } } } },
    take: TOPE_DEUDORES,
    select: {
      id: true,
      nombre: true,
      telefono: true,
      direccion: true,
      fiados: {
        where: { saldoCop: { gt: 0 } },
        select: { id: true, saldoCop: true, montoCop: true, createdAt: true },
      },
    },
  });

  return deudores
    .map((d) => ({
      id: d.id,
      nombre: d.nombre,
      telefono: d.telefono,
      direccion: d.direccion,
      deudaCop: saldoTotal(d.fiados),
      cuantos: d.fiados.length,
      diasDeLaMasVieja: diasDeLaDeudaMasVieja(d.fiados) ?? 0,
    }))
    // El que lleva más tiempo debiendo va arriba. Ordenar por monto escondería al
    // que debe poco desde hace cuatro meses, que es justamente al que nadie cobra.
    .sort((a, b) => b.diasDeLaMasVieja - a.diasDeLaMasVieja);
}

export type DeudorDeCartera = Awaited<ReturnType<typeof getCartera>>[number];

/** La ficha de una persona: sus fiados vivos y sus abonos. */
export async function getFichaDeDeudor(businessId: string, deudorId: string) {
  const db = tenantDb(businessId);

  const deudor = await db.deudor.findFirst({
    where: { id: deudorId, deletedAt: null },
    select: {
      id: true,
      nombre: true,
      telefono: true,
      direccion: true,
      notas: true,
      fiados: {
        // Del más viejo al más nuevo: es el orden en que los salda un abono, así
        // que la pantalla tiene que mostrarlos igual.
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          montoCop: true,
          saldoCop: true,
          createdAt: true,
          saldadoEn: true,
          condonadoEn: true,
          condonadoMotivo: true,
          order: { select: { id: true, code: true } },
          creadoPor: { select: { name: true } },
        },
      },
      abonos: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          montoCop: true,
          method: true,
          nota: true,
          createdAt: true,
          recibidoPor: { select: { name: true } },
          aplicaciones: {
            select: {
              montoCop: true,
              fiado: { select: { order: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });
  if (!deudor) return null;

  return {
    ...deudor,
    deudaCop: saldoTotal(deudor.fiados),
  };
}

export type FichaDeDeudor = NonNullable<Awaited<ReturnType<typeof getFichaDeDeudor>>>;

/**
 * Lo que un teléfono ya debe, para decirlo ANTES de fiarle otra vez.
 *
 * Fiarle a alguien sin saber cuánto lleva es exactamente lo que convierte una
 * cartera en un problema. No bloquea nada —cuánto se le fía a quién es una
 * decisión del negocio— pero no se fía a ciegas.
 */
export async function getDeudaPorTelefono(businessId: string, telefono: string) {
  const deudor = await tenantDb(businessId).deudor.findFirst({
    where: { telefono, deletedAt: null },
    select: {
      id: true,
      nombre: true,
      direccion: true,
      fiados: { where: { saldoCop: { gt: 0 } }, select: { saldoCop: true } },
    },
  });
  if (!deudor) return null;

  return {
    id: deudor.id,
    nombre: deudor.nombre,
    direccion: deudor.direccion,
    deudaCop: saldoTotal(deudor.fiados),
    cuantos: deudor.fiados.length,
  };
}

/** Cuánta gente debe. Es la insignia del menú. */
export async function contarDeudores(businessId: string): Promise<number> {
  return tenantDb(businessId).deudor.count({
    where: { deletedAt: null, fiados: { some: { saldoCop: { gt: 0 } } } },
  });
}
