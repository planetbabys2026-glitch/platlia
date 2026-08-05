import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/**
 * Informe de una jornada.
 *
 * Todo se filtra por `businessDate` y no por un rango de horas: la jornada de un
 * bar que cierra a las 3 a.m. no coincide con el día del calendario, y el
 * businessDate ya viene calculado con la zona horaria y el corte de la empresa.
 * Filtrar por `createdAt BETWEEN` sería exactamente el error que ese campo evita.
 *
 * Solo cuentan los pedidos PAGADOS. Uno abierto todavía no es una venta, y uno
 * anulado nunca lo fue.
 */

export type ResumenDeJornada = {
  ventasCop: number;
  baseGravableCop: number;
  impuestoCop: number;
  propinasCop: number;
  descuentosCop: number;
  pedidos: number;
  comensales: number;
};

export async function getResumenDeJornada(
  businessId: string,
  businessDate: Date,
): Promise<ResumenDeJornada> {
  const agregado = await tenantDb(businessId).order.aggregate({
    where: { businessDate, status: "PAGADA" },
    _sum: {
      totalCop: true,
      subtotalCop: true,
      taxCop: true,
      tipCop: true,
      discountCop: true,
      guestsCount: true,
    },
    _count: { _all: true },
  });

  return {
    ventasCop: agregado._sum.totalCop ?? 0,
    baseGravableCop: agregado._sum.subtotalCop ?? 0,
    impuestoCop: agregado._sum.taxCop ?? 0,
    propinasCop: agregado._sum.tipCop ?? 0,
    descuentosCop: agregado._sum.discountCop ?? 0,
    pedidos: agregado._count._all,
    comensales: agregado._sum.guestsCount ?? 0,
  };
}

/** Cuánto entró por cada medio de pago. Es lo que se cuadra contra el datáfono. */
export async function getPorMetodoDePago(businessId: string, businessDate: Date) {
  const filas = await tenantDb(businessId).orderPayment.groupBy({
    by: ["method"],
    where: { voidedAt: null, order: { businessDate, status: "PAGADA" } },
    _sum: { amountCop: true },
    _count: { _all: true },
  });

  return filas
    .map((f) => ({
      method: f.method,
      totalCop: f._sum.amountCop ?? 0,
      cantidad: f._count._all,
    }))
    .sort((a, b) => b.totalCop - a.totalCop);
}

/**
 * El impuesto separado por tarifa.
 *
 * Se agrupa por la tarifa CONGELADA en cada renglón, no por la vigente: si el
 * negocio cambió de régimen ayer, lo vendido antes tiene que seguir declarándose
 * como se cobró.
 */
export async function getPorTarifa(businessId: string, businessDate: Date) {
  const filas = await tenantDb(businessId).orderItem.groupBy({
    by: ["taxRateNameSnapshot", "taxRateBpSnapshot"],
    where: {
      status: { not: "ANULADO" },
      order: { businessDate, status: "PAGADA" },
    },
    _sum: { lineSubtotalCop: true, lineTaxCop: true },
  });

  return filas
    .map((f) => ({
      nombre: f.taxRateNameSnapshot,
      rateBp: f.taxRateBpSnapshot,
      baseCop: f._sum.lineSubtotalCop ?? 0,
      impuestoCop: f._sum.lineTaxCop ?? 0,
    }))
    .sort((a, b) => b.baseCop - a.baseCop);
}

/**
 * Lo más vendido de la jornada.
 *
 * Se agrupa por el nombre congelado y no por productId: si un producto se
 * archivó y volvió con otro registro, en el informe de ese día tiene que seguir
 * apareciendo como se vendió.
 */
export async function getProductosMasVendidos(
  businessId: string,
  businessDate: Date,
  limite = 10,
) {
  const filas = await tenantDb(businessId).orderItem.groupBy({
    by: ["nameSnapshot"],
    where: {
      status: { not: "ANULADO" },
      order: { businessDate, status: "PAGADA" },
    },
    _sum: { quantity: true, lineTotalCop: true },
    orderBy: { _sum: { lineTotalCop: "desc" } },
    take: limite,
  });

  return filas.map((f) => ({
    nombre: f.nameSnapshot,
    unidades: f._sum.quantity ?? 0,
    totalCop: f._sum.lineTotalCop ?? 0,
  }));
}

/** Anulaciones de la jornada: lo que después se discute. */
export async function getAnulaciones(businessId: string, businessDate: Date) {
  const db = tenantDb(businessId);

  const [renglones, pedidos] = await Promise.all([
    db.orderItem.findMany({
      where: { status: "ANULADO", order: { businessDate } },
      orderBy: { canceledAt: "desc" },
      take: 20,
      select: {
        id: true,
        nameSnapshot: true,
        quantity: true,
        lineTotalCop: true,
        canceledReason: true,
        canceledBy: { select: { name: true } },
        order: { select: { code: true } },
      },
    }),
    db.order.count({ where: { businessDate, status: "ANULADA" } }),
  ]);

  return { renglones, pedidosAnulados: pedidos };
}
