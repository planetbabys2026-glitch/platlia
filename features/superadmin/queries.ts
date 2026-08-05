import "server-only";
// Superadministración: mira todas las empresas por definición, así que no hay
// businessId con el cual acotar. Es una de las tres excepciones previstas.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";

/**
 * El panorama de todos los negocios.
 *
 * Trae cuentas, no contenido: cuántas mesas y cuántos pedidos, no qué vendieron.
 * Dar soporte no requiere leerle la operación a nadie, y lo que no se muestra no
 * se puede filtrar.
 */
export async function getNegocios() {
  const negocios = await rootDb.business.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          priceCop: true,
          trialEndsAt: true,
          // currentPeriodStart lo pide el tipo PeriodoSuscripcion de lib/billing.
          currentPeriodStart: true,
          currentPeriodEnd: true,
          graceUntil: true,
        },
      },
      _count: { select: { memberships: true, tables: true, products: true, orders: true } },
    },
  });

  return negocios;
}

export async function getResumenPlataforma() {
  const [negocios, activos, usuarios, pagos] = await Promise.all([
    rootDb.business.count({ where: { deletedAt: null } }),
    rootDb.subscription.count({ where: { status: { in: ["ACTIVA", "PRUEBA"] } } }),
    rootDb.user.count({ where: { deletedAt: null } }),
    rootDb.subscriptionPayment.aggregate({
      where: { status: "APROBADO" },
      _sum: { amountCop: true },
      _count: { _all: true },
    }),
  ]);

  return {
    negocios,
    conLicenciaViva: activos,
    usuarios,
    recaudadoCop: pagos._sum.amountCop ?? 0,
    pagosAprobados: pagos._count._all,
  };
}

/**
 * Avisos de MercadoPago que fallaron.
 *
 * Es la primera pantalla que se mira cuando alguien dice "pagué y no me
 * activaron": si el aviso llegó y falló, está acá con su error.
 */
export async function getWebhooksConError() {
  return rootDb.mpWebhookEvent.findMany({
    where: { error: { not: null } },
    orderBy: { receivedAt: "desc" },
    take: 20,
    select: { id: true, mpEventId: true, type: true, error: true, receivedAt: true },
  });
}
