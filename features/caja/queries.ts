import "server-only";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";
import { cuentaDelMetodo, type CuentaDeSaldo } from "@/features/caja/medios-de-pago";
import {
  estadoDeCobro,
  HAY_QUE_COBRAR,
  ORDEN_DE_COBRO,
  sesionDeCobro,
} from "@/features/caja/reglas";

/**
 * Consultas de caja.
 *
 * El corte de caja es la cifra que la persona compara contra el dinero físico
 * antes de irse a su casa, así que se calcula sumando movimientos reales y nunca
 * se cachea: si estas cuentas están mal, alguien paga la diferencia de su bolsillo.
 */

/** Un saldo del turno: el cajón, o la cuenta del banco. */
export type SaldoDeCaja = {
  /** La base con la que se abrió. */
  baseCop: number;
  /** Cobros de la jornada que caen en este saldo. */
  ventasCop: number;
  /** Entradas y ajustes (el ajuste va con su signo). */
  ingresosCop: number;
  /** Gastos y retiros, como magnitud. */
  egresosCop: number;
  /** Lo que debería haber acá ahora mismo. */
  esperadoCop: number;
};

export type ResumenCaja = {
  efectivo: SaldoDeCaja;
  bancos: SaldoDeCaja;
  /** Cobros que no se cuentan en ningún saldo: bonos y "otro". */
  otrosCop: number;
  /**
   * Lo que se fió hoy. No entra a ningún saldo —esa plata está en la calle— pero
   * el cajero necesita verlo: es lo que explica por qué las ventas del día no
   * coinciden con lo que hay para contar.
   */
  fiadoCop: number;
  porMetodo: { method: string; totalCop: number; cantidad: number; cuenta: CuentaDeSaldo }[];
};

/** Una caja física del negocio, con quién la tiene abierta ahora. */
export async function getCajasDelNegocio(businessId: string) {
  const cajas = await tenantDb(businessId).cashRegister.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      sortOrder: true,
      sessions: {
        where: { status: "ABIERTA" },
        select: { id: true, code: true, openedAt: true, openedBy: { select: { name: true } } },
        take: 1,
      },
      _count: { select: { sessions: true } },
    },
  });

  return cajas.map((caja) => ({
    id: caja.id,
    name: caja.name,
    active: caja.active,
    sortOrder: caja.sortOrder,
    turnos: caja._count.sessions,
    abierta: caja.sessions[0] ?? null,
  }));
}

export type CajaDelNegocio = Awaited<ReturnType<typeof getCajasDelNegocio>>[number];

/** Todos los turnos abiertos del negocio ahora mismo. */
export async function getSesionesAbiertas(businessId: string) {
  return tenantDb(businessId).cashSession.findMany({
    where: { status: "ABIERTA" },
    orderBy: { openedAt: "asc" },
    select: {
      id: true,
      code: true,
      businessDate: true,
      openingFloatCop: true,
      openingBankCop: true,
      openedAt: true,
      openedById: true,
      openedBy: { select: { name: true } },
      cashRegister: { select: { id: true, name: true } },
    },
  });
}

export type SesionAbiertaDeCaja = Awaited<ReturnType<typeof getSesionesAbiertas>>[number];

/**
 * El turno que esta persona está operando.
 *
 * Es `sesionDeCobro` mirado desde la pantalla: la propia si abrió turno; la única
 * abierta si no tiene (el dueño que se para un rato en la caja); y nada si hay
 * varias y ninguna es suya, que es cuando la pantalla tiene que pedirle que abra
 * la suya en vez de mostrarle el arqueo de otro.
 *
 * Que la pantalla y el cobro usen la MISMA regla es el punto: si divergieran, el
 * cajero vería un arqueo y la plata caería en otro.
 */
export async function getSesionDeTrabajo(businessId: string, userId: string) {
  const abiertas = await getSesionesAbiertas(businessId);
  const elegida = sesionDeCobro(
    abiertas.map((s) => ({ id: s.id, openedById: s.openedById, cajaNombre: s.cashRegister.name })),
    userId,
  );
  if (!elegida.ok) return { sesion: null, abiertas };

  return {
    sesion: abiertas.find((s) => s.id === elegida.cashSessionId) ?? null,
    abiertas,
  };
}

/**
 * Los dos saldos del turno: el cajón y el banco.
 *
 * Hasta acá el arqueo cuadraba uno solo. Todo lo que entraba por datáfono o Nequi
 * se listaba "por método" sin nada contra qué compararlo, y todo lo que salía
 * —incluido el proveedor pagado por transferencia— descontaba del cajón: el turno
 * cerraba con un faltante por plata que nunca había estado ahí.
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
      select: { openingFloatCop: true, openingBankCop: true },
    }),
    db.orderPayment.groupBy({
      by: ["method"],
      where: { cashSessionId, voidedAt: null },
      _sum: { amountCop: true },
      _count: { _all: true },
    }),
    db.cashMovement.groupBy({
      by: ["type", "account"],
      where: { cashSessionId },
      _sum: { amountCop: true },
    }),
  ]);

  const porMetodo = pagos
    .map((p) => ({
      method: p.method as string,
      totalCop: p._sum.amountCop ?? 0,
      cantidad: p._count._all,
      cuenta: cuentaDelMetodo(p.method),
    }))
    .sort((a, b) => b.totalCop - a.totalCop);

  const ventasDe = (cuenta: CuentaDeSaldo) =>
    porMetodo.filter((p) => p.cuenta === cuenta).reduce((t, p) => t + p.totalCop, 0);

  const movimientoDe = (tipo: string, cuenta: "EFECTIVO" | "BANCO") =>
    movimientos.find((m) => m.type === tipo && m.account === cuenta)?._sum.amountCop ?? 0;

  const saldo = (cuenta: "EFECTIVO" | "BANCO", baseCop: number): SaldoDeCaja => {
    const ventasCop = ventasDe(cuenta);
    const ingresosCop = movimientoDe("INGRESO", cuenta) + movimientoDe("AJUSTE", cuenta);
    const egresosCop = movimientoDe("EGRESO", cuenta) + movimientoDe("RETIRO", cuenta);
    return {
      baseCop,
      ventasCop,
      ingresosCop,
      egresosCop,
      esperadoCop: baseCop + ventasCop + ingresosCop - egresosCop,
    };
  };

  return {
    efectivo: saldo("EFECTIVO", sesion.openingFloatCop),
    bancos: saldo("BANCO", sesion.openingBankCop),
    otrosCop: ventasDe("OTRO"),
    fiadoCop: ventasDe("CREDITO"),
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
      expectedBankCop: true,
      countedBankCop: true,
      differenceBankCop: true,
      notes: true,
      closedBy: { select: { name: true } },
      cashRegister: { select: { name: true } },
    },
  });
}

/**
 * Si hay AL MENOS una caja abierta en el negocio.
 *
 * Es lo único que necesitan el salón, el POS y la pantalla del pedido: la
 * pregunta ahí es "¿se puede tomar pedidos?", no "¿en qué cajón cae la plata?".
 * Antes se traía la sesión entera con `findFirst` y, desde que hay varias cajas,
 * eso era elegir una al azar para responder un booleano.
 */
export async function hayCajaAbierta(businessId: string): Promise<boolean> {
  const abierta = await tenantDb(businessId).cashSession.findFirst({
    where: { status: "ABIERTA" },
    select: { id: true },
  });
  return abierta !== null;
}

/** Las cajas que están libres para abrir turno ahora. */
export async function getCajasDisponibles(businessId: string) {
  const cajas = await tenantDb(businessId).cashRegister.findMany({
    where: { deletedAt: null, active: true, sessions: { none: { status: "ABIERTA" } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return cajas;
}

export async function getMovimientos(businessId: string, cashSessionId: string) {
  return tenantDb(businessId).cashMovement.findMany({
    where: { cashSessionId },
    select: {
      id: true,
      type: true,
      account: true,
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
        // Lo pide el diálogo de facturación: sin el correo, la factura no le
        // llega a nadie y quien emite no puede corregirlo.
        customerEmail: true,
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
 * Las cuentas vivas de la jornada, ordenadas como las atendería una persona.
 *
 * Desde que la caja lista todo lo que ya salió a cocina —y no solo lo que alguien
 * mandó—, esta lista es el piso entero, y sin jerarquía eso es peor que antes: la
 * mesa que levantó la mano queda enterrada entre las que recién pidieron. El
 * orden lo decide `estadoDeCobro` (puro y con tests) y se aplica **en memoria**:
 * es una derivación de los renglones que SQL no sabe hacer sin una subconsulta
 * por fila, y son las cuentas de una jornada, no un listado sin techo.
 *
 * Dentro de cada grupo manda la antigüedad: entre dos mesas que pidieron la
 * cuenta, primero la que lleva más rato esperando.
 */
export async function getCuentasPorCobrar(
  businessId: string,
  businessDate: Date,
  /**
   * Si la cocina tiene pantalla. Con "solo papel" nadie marca un plato listo, así
   * que la caja no puede esperar esa señal para dejar cobrar.
   */
  hayKds = true,
) {
  const pedidos = await tenantDb(businessId).order.findMany({
    where: { businessDate, ...HAY_QUE_COBRAR },
    orderBy: [{ billRequestedAt: "asc" }, { openedAt: "asc" }],
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
      // `deliveryStatus` y el estado de cada renglón deciden el orden de la lista.
      deliveryStatus: true,
      items: {
        where: { status: { not: "ANULADO" } },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          lineTotalCop: true,
          status: true,
        },
      },
    },
  });

  return pedidos
    .map((pedido) => ({
      ...pedido,
      estadoCobro: estadoDeCobro(
        {
          status: pedido.status,
          deliveryStatus: pedido.deliveryStatus,
          items: pedido.items,
        },
        { hayKds },
      ),
    }))
    .sort((a, b) => ORDEN_DE_COBRO[a.estadoCobro] - ORDEN_DE_COBRO[b.estadoCobro]);
}

export type CuentaPorCobrar = Awaited<ReturnType<typeof getCuentasPorCobrar>>[number];
