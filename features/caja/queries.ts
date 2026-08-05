import "server-only";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";

/**
 * Consultas de caja.
 *
 * El corte de caja es la cifra que la persona compara contra el dinero físico
 * antes de irse a su casa, así que se calcula sumando movimientos reales y nunca
 * se cachea: si estas cuentas están mal, alguien paga la diferencia de su bolsillo.
 */

export type ResumenCaja = {
  openingFloatCop: number;
  /** Ventas cobradas en efectivo durante el turno. */
  efectivoVentasCop: number;
  ingresosCop: number;
  egresosCop: number;
  /** Lo que debería haber en el cajón ahora mismo. */
  esperadoCop: number;
  /** Cobros que no son efectivo, para cuadrar contra el datáfono y las apps. */
  porMetodo: { method: string; totalCop: number; cantidad: number }[];
};

export async function getCajaAbierta(businessId: string) {
  return tenantDb(businessId).cashSession.findFirst({
    where: { status: "ABIERTA" },
    select: {
      id: true,
      code: true,
      businessDate: true,
      openingFloatCop: true,
      openedAt: true,
      openedBy: { select: { name: true } },
    },
    orderBy: { openedAt: "desc" },
  });
}

/**
 * Lo que debería haber en el cajón: base + ventas en efectivo + ingresos − salidas.
 *
 * Los ajustes van con signo (un faltante se registra negativo) y por eso suman
 * como vienen; ingresos, egresos y retiros son magnitudes y el signo lo pone su
 * tipo. Los pagos anulados no cuentan.
 */
export async function getResumenCaja(
  db: TenantDb,
  cashSessionId: string,
): Promise<ResumenCaja> {
  const [sesion, pagos, movimientos] = await Promise.all([
    db.cashSession.findFirstOrThrow({
      where: { id: cashSessionId },
      select: { openingFloatCop: true },
    }),
    db.orderPayment.groupBy({
      by: ["method"],
      where: { cashSessionId, voidedAt: null },
      _sum: { amountCop: true },
      _count: { _all: true },
    }),
    db.cashMovement.groupBy({
      by: ["type"],
      where: { cashSessionId },
      _sum: { amountCop: true },
    }),
  ]);

  const porMetodo = pagos
    .map((p) => ({
      method: p.method,
      totalCop: p._sum.amountCop ?? 0,
      cantidad: p._count._all,
    }))
    .sort((a, b) => b.totalCop - a.totalCop);

  const efectivoVentasCop =
    porMetodo.find((p) => p.method === "EFECTIVO")?.totalCop ?? 0;

  const suma = (tipo: string) =>
    movimientos.find((m) => m.type === tipo)?._sum.amountCop ?? 0;

  const ingresosCop = suma("INGRESO") + suma("AJUSTE");
  const egresosCop = suma("EGRESO") + suma("RETIRO");

  return {
    openingFloatCop: sesion.openingFloatCop,
    efectivoVentasCop,
    ingresosCop,
    egresosCop,
    esperadoCop: sesion.openingFloatCop + efectivoVentasCop + ingresosCop - egresosCop,
    porMetodo,
  };
}

export async function getMovimientos(businessId: string, cashSessionId: string) {
  return tenantDb(businessId).cashMovement.findMany({
    where: { cashSessionId },
    select: {
      id: true,
      type: true,
      amountCop: true,
      concept: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
