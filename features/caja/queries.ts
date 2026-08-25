import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";
import { DOMICILIOS_COBRABLES } from "@/features/domicilios/reglas";

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

/**
 * El último turno cerrado.
 *
 * La pantalla de caja lo muestra cuando no hay turno abierto, y no es un adorno:
 * al cerrar, la tarjeta del formulario desaparece con su mensaje adentro, y la
 * diferencia es exactamente la cifra que hay que poder mirar después. También
 * sirve para que el dueño vea de una cómo cerró anoche.
 */
export async function getUltimoCierre(businessId: string) {
  return tenantDb(businessId).cashSession.findFirst({
    where: { status: "CERRADA" },
    orderBy: { closedAt: "desc" },
    select: {
      id: true,
      code: true,
      businessDate: true,
      closedAt: true,
      expectedCashCop: true,
      countedCashCop: true,
      differenceCop: true,
      notes: true,
      closedBy: { select: { name: true } },
    },
  });
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

/**
 * Cuántas cuentas hay esperando cobro. Solo el número, para la insignia del menú.
 *
 * Es el contador que antes vivía en la píldora "Cobro de cuentas" y que se perdía
 * al sacar la tira: es urgencia, no tamaño, así que sube al menú y se ve desde
 * cualquier pantalla en vez de solo estando parado en Caja.
 */
/**
 * Qué pedido tiene algo que cobrar.
 *
 * Un domicilio entra recién cuando salió de la cocina. Antes el filtro miraba
 * solo el `status` de la venta, así que un pedido del menú QR aparecía en caja en
 * el mismo instante en que el comensal tocaba "enviar": el cajero veía cuentas de
 * comida que todavía no existía y la insignia del menú contaba de más.
 *
 * `deliveryStatus: null` es todo lo que no es domicilio —mesa y mostrador—, que
 * sigue entrando como siempre.
 */
const HAY_QUE_COBRAR = {
  status: { in: ["ABIERTA", "CUENTA_PEDIDA"] },
  items: { some: { status: { not: "ANULADO" } } },
  OR: [
    { deliveryStatus: { in: [...DOMICILIOS_COBRABLES] } },
    { status: "CUENTA_PEDIDA" },
    { tableId: null, status: "ABIERTA" },
    { items: { every: { status: { in: ["LISTO", "ENTREGADO", "ANULADO"] } } } },
  ],
} satisfies Prisma.OrderWhereInput;

export async function contarCuentasPorCobrar(businessId: string, businessDate: Date) {
  return tenantDb(businessId).order.count({
    where: { businessDate, ...HAY_QUE_COBRAR },
  });
}

/** Tope de pedidos que trae el historial de una jornada. */
export const TOPE_CUENTAS_COBRADAS = 500;

/**
 * Lo que ya se cobró en la jornada, para poder volver a mirarlo.
 *
 * Hasta acá una cuenta cobrada desaparecía de la pantalla: `getCuentasPorCobrar`
 * filtra por `ABIERTA` / `CUENTA_PEDIDA`, y no había ninguna otra vista que
 * listara pedidos uno por uno —los informes son todos agregados—. Reimprimir una
 * tirilla o revisar a quién se le cobró hace media hora no tenía dónde hacerse.
 *
 * No trae los renglones a propósito: quinientos pedidos por sus ítems es un
 * payload que la tabla no usa, y el detalle completo ya lo da la tirilla, que
 * está a un clic. Se devuelve también el total para poder avisar cuando la
 * jornada pasó el tope en vez de mentir por omisión.
 */
export async function getCuentasCobradas(businessId: string, businessDate: Date) {
  const db = tenantDb(businessId);
  const where = { businessDate, status: "PAGADA" } as const;

  const [pedidos, total] = await Promise.all([
    db.order.findMany({
      where,
      // `closedAt` y no `openedAt`: la pregunta es "qué se cobró recién", y una
      // mesa que estuvo abierta tres horas se cobró al final, no al principio.
      orderBy: { closedAt: "desc" },
      take: TOPE_CUENTAS_COBRADAS,
      select: {
        id: true,
        code: true,
        type: true,
        channel: true,
        turnNumber: true,
        totalCop: true,
        tipCop: true,
        closedAt: true,
        customerName: true,
        customerPhone: true,
        docType: true,
        docNumber: true,
        table: { select: { name: true } },
        closedBy: { select: { name: true } },
        // Los anulados no cuentan como cobro: el mismo criterio que usa el
        // arqueo (`getResumenCaja` filtra `voidedAt: null`).
        payments: {
          where: { voidedAt: null },
          select: { method: true, amountCop: true },
        },
        _count: { select: { items: true } },
        facturaElectronicaNumero: true,
        facturaElectronicaCufe: true,
        facturaElectronicaUrlPdf: true,
        facturaElectronicaEstado: true,
        facturaElectronicaError: true,
        notaCreditoNumero: true,
        notaCreditoCufe: true,
        notaCreditoUrlPdf: true,
      },
    }),
    db.order.count({ where }),
  ]);

  return { pedidos, total };
}

/**
 * Trae las cuentas y pedidos pendientes de cobro para la caja.
 *
 * Las que tienen `CUENTA_PEDIDA` salen arriba de todo con prioridad para que el
 * cajero las cobre y libere las mesas de forma ágil.
 */
export async function getCuentasPorCobrar(businessId: string, businessDate: Date) {
  return tenantDb(businessId).order.findMany({
    where: { businessDate, ...HAY_QUE_COBRAR },
    orderBy: [
      { status: "asc" },
      { billRequestedAt: "desc" },
      { openedAt: "desc" },
    ],
    select: {
      id: true,
      code: true,
      type: true,
      turnNumber: true,
      status: true,
      totalCop: true,
      paidCop: true,
      subtotalCop: true,
      taxCop: true,
      tipCop: true,
      deliveryFeeCop: true,
      customerName: true,
      // Para precargar el bloque fiscal cuando alguien ya había pedido factura.
      docType: true,
      docNumber: true,
      customerEmail: true,
      billRequestedAt: true,
      openedAt: true,
      // La pantalla agrupa por mesa: tres cuentas separadas de la mesa 12 son
      // tres cobros distintos, pero el cajero tiene que verlas juntas o le va a
      // cobrar a una persona la cuenta de otra.
      tableId: true,
      table: { select: { id: true, name: true } },
      openedBy: { select: { name: true } },
      items: {
        where: { status: { not: "ANULADO" } },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          lineTotalCop: true,
        },
      },
    },
  });
}
