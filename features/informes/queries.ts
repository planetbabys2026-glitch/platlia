import "server-only";
import { tenantDb } from "@/lib/db/tenant";
import { calcularStockDisponibleProducto } from "@/lib/inventory/stock";
import { margenPorcentual } from "@/lib/money";
import { getSettings } from "@/features/negocio/queries";
import { diasDelPeriodo, type Periodo } from "@/features/informes/periodo";
import { formatBusinessDate } from "@/lib/time";

/**
 * El día de negocio como texto, para el SQL crudo.
 *
 * **No se manda el `Date`.** `businessDate` es una columna DATE y sus valores son
 * la medianoche UTC del día; mandando un `Date`, el driver lo escribe como
 * timestamptz y Postgres tiene que castear una de las dos puntas usando el
 * TimeZone de la SESIÓN —que no es el del negocio ni el nuestro—. En Colombia eso
 * corre el borde cinco horas y el primer día del mes se cae del informe. Un
 * `'2026-08-27'::date` no depende de ninguna zona.
 */
function comoFecha(businessDate: Date): string {
  return formatBusinessDate(businessDate);
}

/**
 * Informe de un período.
 *
 * Todo se filtra por `businessDate` y no por un rango de horas: la jornada de un
 * bar que cierra a las 3 a.m. no coincide con el día del calendario, y el
 * businessDate ya viene calculado con la zona horaria y el corte de la empresa.
 * Filtrar por `createdAt BETWEEN` sería exactamente el error que ese campo evita.
 *
 * El período es un tramo de DÍAS, no de instantes, así que las dos puntas son
 * inclusivas: `businessDate` es una columna DATE con valores discretos y no hay
 * un "último milisegundo" que se pueda escapar entre `lte` y `lt`. Ese cuidado
 * —el rango semiabierto de `businessDayRange`— es para los instantes.
 *
 * Solo cuentan los pedidos PAGADOS. Uno abierto todavía no es una venta, y uno
 * anulado nunca lo fue.
 */

/** El fragmento de `where` que acota cualquier informe a su período. */
export function enElPeriodo(p: Periodo) {
  return { gte: p.desde, lte: p.hasta };
}

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
  periodo: Periodo,
): Promise<ResumenDeJornada> {
  const agregado = await tenantDb(businessId).order.aggregate({
    where: { businessDate: enElPeriodo(periodo), status: "PAGADA" },
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
export async function getPorMetodoDePago(businessId: string, periodo: Periodo) {
  const filas = await tenantDb(businessId).orderPayment.groupBy({
    by: ["method"],
    where: { voidedAt: null, order: { businessDate: enElPeriodo(periodo), status: "PAGADA" } },
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
export async function getPorTarifa(businessId: string, periodo: Periodo) {
  const filas = await tenantDb(businessId).orderItem.groupBy({
    by: ["taxRateNameSnapshot", "taxRateBpSnapshot"],
    where: {
      status: { not: "ANULADO" },
      order: { businessDate: enElPeriodo(periodo), status: "PAGADA" },
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
  periodo: Periodo,
  limite = 10,
) {
  const filas = await tenantDb(businessId).orderItem.groupBy({
    by: ["nameSnapshot"],
    where: {
      status: { not: "ANULADO" },
      order: { businessDate: enElPeriodo(periodo), status: "PAGADA" },
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
export async function getAnulaciones(businessId: string, periodo: Periodo) {
  const db = tenantDb(businessId);

  const [renglones, pedidos] = await Promise.all([
    db.orderItem.findMany({
      where: { status: "ANULADO", order: { businessDate: enElPeriodo(periodo) } },
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
    db.order.count({ where: { businessDate: enElPeriodo(periodo), status: "ANULADA" } }),
  ]);

  return { renglones, pedidosAnulados: pedidos };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alertas de Inventario & Abastecimiento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Costo de ventas y margen de la jornada, por producto.
 *
 * Se apoya en `OrderItem.lineCostCop`, congelado al vender. Reconstruirlo acá
 * cruzando cada renglón con la receta ACTUAL sería el mismo error que
 * `taxRateBpSnapshot` existe para evitar: el informe de marzo cambiaría cada vez
 * que un proveedor sube un precio en diciembre.
 *
 * Dos decisiones que no son obvias:
 *
 * - **Se agrupa por `productId` además del nombre.** `getProductosMasVendidos`
 *   agrupa solo por `nameSnapshot` a propósito, para que un producto archivado y
 *   recreado siga siendo la misma fila. Acá hace falta el id igual, porque es lo
 *   único que permite enlazar a la ficha del producto desde el informe.
 * - **La venta que se compara es `lineSubtotalCop`, la base gravable.** El
 *   impuesto se cobra para entregarlo: contarlo como ingreso propio infla el
 *   margen del negocio entero.
 */
export interface RenglonDeMargen {
  productId: string;
  nombre: string;
  unidades: number;
  ventaNetaCop: number;
  costoCop: number;
  utilidadCop: number;
  /** null cuando no se vendió nada de ese producto en la jornada. */
  margenPct: number | null;
  /** Renglones de ese producto que se vendieron sin costo conocido. */
  renglonesSinCosto: number;
}

export interface InformeDeMargen {
  /** El inventario está apagado: no hay costos que informar, y no es lo mismo que cero. */
  inventarioActivo: boolean;
  ventaNetaCop: number;
  costoCop: number;
  utilidadCop: number;
  margenPct: number | null;
  /** Cuántos renglones de la jornada no traen costo, para poder decirlo. */
  renglonesSinCosto: number;
  renglonesTotales: number;
  productos: RenglonDeMargen[];
}

export async function getCostoYMargen(
  businessId: string,
  periodo: Periodo,
): Promise<InformeDeMargen> {
  const vacio: InformeDeMargen = {
    inventarioActivo: false,
    ventaNetaCop: 0,
    costoCop: 0,
    utilidadCop: 0,
    margenPct: null,
    renglonesSinCosto: 0,
    renglonesTotales: 0,
    productos: [],
  };

  const settings = await getSettings(businessId);
  if (!settings.inventoryEnabled) return vacio;

  const db = tenantDb(businessId);
  const where = {
    status: { not: "ANULADO" as const },
    order: { businessDate: enElPeriodo(periodo), status: "PAGADA" as const },
  };

  const [filas, sinCosto] = await Promise.all([
    db.orderItem.groupBy({
      by: ["productId", "nameSnapshot"],
      where,
      _sum: { quantity: true, lineSubtotalCop: true, lineCostCop: true },
      _count: { _all: true },
    }),
    // Los renglones sin costo no se pueden contar con el mismo groupBy: `_sum`
    // ignora los nulos en silencio, así que sin esto un día entero sin costear
    // se vería como margen del 100%.
    db.orderItem.groupBy({
      by: ["productId"],
      where: { ...where, lineCostCop: null },
      _count: { _all: true },
    }),
  ]);

  const sinCostoPorProducto = new Map(sinCosto.map((f) => [f.productId, f._count._all]));

  const productos: RenglonDeMargen[] = filas.map((fila) => {
    const ventaNetaCop = fila._sum.lineSubtotalCop ?? 0;
    const costoCop = fila._sum.lineCostCop ?? 0;
    const utilidadCop = ventaNetaCop - costoCop;
    return {
      productId: fila.productId,
      nombre: fila.nameSnapshot,
      unidades: fila._sum.quantity ?? 0,
      ventaNetaCop,
      costoCop,
      utilidadCop,
      margenPct: margenPorcentual(utilidadCop, ventaNetaCop),
      renglonesSinCosto: sinCostoPorProducto.get(fila.productId) ?? 0,
    };
  });

  productos.sort((a, b) => b.utilidadCop - a.utilidadCop);

  const ventaNetaCop = productos.reduce((acc, p) => acc + p.ventaNetaCop, 0);
  const costoCop = productos.reduce((acc, p) => acc + p.costoCop, 0);
  const utilidadCop = ventaNetaCop - costoCop;

  return {
    inventarioActivo: true,
    ventaNetaCop,
    costoCop,
    utilidadCop,
    margenPct: margenPorcentual(utilidadCop, ventaNetaCop),
    renglonesSinCosto: productos.reduce((acc, p) => acc + p.renglonesSinCosto, 0),
    renglonesTotales: filas.reduce((acc, f) => acc + f._count._all, 0),
    productos,
  };
}

export interface AlertaInventarioItem {
  id: string;
  tipo: "INSUMO" | "PRODUCTO_TERMINADO" | "RECETA_PLATOS";
  nombre: string;
  categoria?: string;
  unidad?: string;
  stockActual: number;
  stockMinimo: number;
  porcionesDisponibles?: number | null;
  mensaje: string;
  nivel: "CRITICO" | "BAJO";
}

/**
 * Recopila todas las alertas de inventario (insumos de materia prima y productos terminados)
 * que estén agotados o por debajo del stock mínimo.
 */
export async function getAlertasInventario(businessId: string): Promise<AlertaInventarioItem[]> {
  const settings = await getSettings(businessId);
  if (!settings.inventoryEnabled) return [];

  const db = tenantDb(businessId);

  const [insumos, productos] = await Promise.all([
    db.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { stockCurrent: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        stockCurrent: true,
        stockMin: true,
      },
    }),
    db.product.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        trackStock: true,
        stockQty: true,
        stockMin: true,
        hasRecipe: true,
        recipeItems: {
          select: {
            quantityRequired: true,
            inventoryItem: {
              select: { id: true, name: true, unit: true, stockCurrent: true },
            },
          },
        },
      },
    }),
  ]);

  const alertas: AlertaInventarioItem[] = [];

  for (const ins of insumos) {
    const minAlert = ins.stockMin > 0 ? ins.stockMin : 5;
    if (ins.stockCurrent <= minAlert) {
      alertas.push({
        id: `insumo-${ins.id}`,
        tipo: "INSUMO",
        nombre: ins.name,
        unidad: ins.unit,
        stockActual: ins.stockCurrent,
        stockMinimo: ins.stockMin,
        nivel: ins.stockCurrent <= 0 ? "CRITICO" : "BAJO",
        mensaje:
          ins.stockCurrent <= 0
            ? `Insumo AGOTADO en bodega (0 ${ins.unit})`
            : `Stock bajo de insumo: ${ins.stockCurrent} ${ins.unit} (Mín: ${minAlert})`,
      });
    }
  }

  for (const prod of productos) {
    if (prod.trackStock) {
      // El umbral es el mínimo que cargó el negocio. El 5 fijo que había acá
      // trataba igual a un bar que vende cinco cajas de cerveza por noche y a uno
      // que vende cinco botellas de whisky al mes.
      const minAlert = prod.stockMin > 0 ? prod.stockMin : 5;
      if (prod.stockQty <= minAlert) {
        alertas.push({
          id: `prod-${prod.id}`,
          tipo: "PRODUCTO_TERMINADO",
          nombre: prod.name,
          categoria: prod.category.name,
          stockActual: prod.stockQty,
          stockMinimo: minAlert,
          nivel: prod.stockQty <= 0 ? "CRITICO" : "BAJO",
          mensaje:
            prod.stockQty <= 0
              ? `Producto terminado AGOTADO (0 und.)`
              : `Stock bajo de producto terminado: ${prod.stockQty} und. (Mín: ${minAlert})`,
        });
      }
    }

    if (prod.recipeItems.length > 0) {
      const disp = calcularStockDisponibleProducto(prod);
      if (disp !== null && disp <= 5) {
        alertas.push({
          id: `receta-${prod.id}`,
          tipo: "RECETA_PLATOS",
          nombre: prod.name,
          categoria: prod.category.name,
          stockActual: disp,
          stockMinimo: 5,
          porcionesDisponibles: disp,
          nivel: disp <= 0 ? "CRITICO" : "BAJO",
          mensaje:
            disp <= 0
              ? `Plato/Receta sin insumos suficientes (0 porciones preparables)`
              : `Baja disponibilidad por receta: solo ${disp} porciones preparables`,
        });
      }
    }
  }

  return alertas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Horas pico
// ─────────────────────────────────────────────────────────────────────────────

export type FranjaHoraria = {
  /** 0 a 23, en la hora de la empresa. */
  hora: number;
  pedidos: number;
  ventasCop: number;
};

export type InformeDeHoras = {
  franjas: FranjaHoraria[];
  /** La franja con más pedidos, para poder nombrarla sin que nadie lea la barra. */
  pico: FranjaHoraria | null;
  pedidos: number;
  /** Cuántos días de negocio cubre el tramo, para poder promediar por día. */
  dias: number;
};

/**
 * Cuándo trabaja el local, hora por hora.
 *
 * **Se cuenta por `openedAt`, no por `closedAt`.** La pregunta es a qué hora hay
 * que tener gente en el piso, y eso lo decide cuándo ENTRAN los pedidos: una mesa
 * que se abre a las 8 y paga a las 11 es trabajo de las 8. Contando por el pago,
 * el pico se correría hacia el cierre y la conclusión sería contratar a la hora
 * en que la cocina ya está apagada.
 *
 * Va en SQL crudo y no con `groupBy` porque Prisma no sabe extraer una hora en la
 * zona del negocio. Las dos reglas de la casa se cumplen igual: el `businessId`
 * viaja como parámetro y está a la vista en el WHERE —`$queryRaw` pasa de largo
 * el scoping de `tenantDb`—, y el día de negocio también, así que no hay ningún
 * `now()::date` decidiendo nada del lado del servidor de base.
 *
 * La zona se aplica solo para leer la hora del reloj de pared; a qué jornada
 * pertenece cada pedido ya lo dice `businessDate`, que se calculó con la zona y
 * el corte. Por eso un bar que cierra a las 3 a.m. ve su pico en la madrugada
 * dentro del día que corresponde, y no partido entre dos.
 */
export async function getHorasPico(
  businessId: string,
  periodo: Periodo,
  timeZone: string,
): Promise<InformeDeHoras> {
  const filas = await tenantDb(businessId).$queryRaw<
    { hora: number; pedidos: number; ventas: bigint | number | null }[]
  >`
    SELECT date_part('hour', "openedAt" AT TIME ZONE ${timeZone})::int AS hora,
           COUNT(*)::int                                                AS pedidos,
           COALESCE(SUM("totalCop"), 0)::bigint                         AS ventas
    FROM "Order"
    WHERE "businessId" = ${businessId}
      AND "status" = 'PAGADA'
      AND "businessDate" >= ${comoFecha(periodo.desde)}::date
      AND "businessDate" <= ${comoFecha(periodo.hasta)}::date
    GROUP BY 1
    ORDER BY 1
  `;

  // El bigint no cruza el límite RSC → Client Component, y un COP entero entra
  // holgado en un number: la suma de un año no se acerca a 2^53.
  const porHora = new Map(
    filas.map((f) => [f.hora, { hora: f.hora, pedidos: f.pedidos, ventasCop: Number(f.ventas ?? 0) }]),
  );

  // Las 24 franjas siempre, con cero donde no hubo nada: sin las horas vacías, un
  // gráfico de barras dibuja "de 12 a 20" pegado y no se ve dónde está el hueco.
  const franjas: FranjaHoraria[] = Array.from({ length: 24 }, (_, hora) =>
    porHora.get(hora) ?? { hora, pedidos: 0, ventasCop: 0 },
  );

  const pedidos = franjas.reduce((n, f) => n + f.pedidos, 0);
  const pico = pedidos === 0 ? null : franjas.reduce((a, b) => (b.pedidos > a.pedidos ? b : a));

  return { franjas, pico, pedidos, dias: diasDelPeriodo(periodo) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiempos de cocina
// ─────────────────────────────────────────────────────────────────────────────

export type TiemposDeCocinero = {
  cocineroId: string;
  cocinero: string;
  /** Renglones que esa persona tomó en el período. */
  renglones: number;
  esperaPromedioMs: number | null;
  preparacionPromedioMs: number | null;
  medidosEspera: number;
  medidosPreparacion: number;
  /** Los que terminó otra persona. Ese tiempo no es tiempo de cocción de nadie. */
  relevados: number;
};

export type InformeDeCocina = {
  /**
   * Si el negocio usa el KDS. Sin KDS nadie toca nada y no hay ni un tiempo que
   * medir: la pantalla lo dice en vez de mostrar una tabla de guiones.
   */
  kdsActivo: boolean;
  esperaPromedioMs: number | null;
  preparacionPromedioMs: number | null;
  renglones: number;
  medidosEspera: number;
  medidosPreparacion: number;
  cocineros: TiemposDeCocinero[];
};

/**
 * Cuánto tarda la cocina, y quién.
 *
 * Dos tramos, no uno: **lo que el plato esperó en la fila** —de que entró a la
 * plancha a que alguien lo tomó— y **lo que tardó en cocinarse** —de que lo
 * tomaron a que lo dieron por terminado—. Mezclados en un solo número no se puede
 * decidir nada: el primero se arregla con más gente, el segundo con otra receta o
 * más equipo, y el promedio de los dos no manda a hacer ninguna de las dos cosas.
 *
 * La aritmética va en SQL porque un año de un local con movimiento son cientos de
 * miles de renglones y traerlos para restar dos fechas en JS no es una opción.
 * Los guardas del WHERE son los mismos que aplica `tiemposDeRenglon` en
 * `features/cocina/reglas.ts`, que es donde está escrita la regla y donde se
 * prueba: un tramo negativo —marcas fuera de orden, una corrección a mano— no
 * entra al promedio, porque un promedio con un número imposible adentro es peor
 * que uno con un dato menos.
 *
 * Y el total no promedia promedios: cada tramo vuelve con su cuenta y la
 * ponderación se hace acá. Un cocinero con dos platos no puede pesar lo mismo que
 * uno con doscientos.
 */
export async function getTiemposDeCocina(
  businessId: string,
  periodo: Periodo,
): Promise<InformeDeCocina> {
  const settings = await getSettings(businessId);
  const kdsActivo = settings.comandaDestino === "KDS" || settings.comandaDestino === "AMBAS";

  const vacio: InformeDeCocina = {
    kdsActivo,
    esperaPromedioMs: null,
    preparacionPromedioMs: null,
    renglones: 0,
    medidosEspera: 0,
    medidosPreparacion: 0,
    cocineros: [],
  };
  if (!kdsActivo) return vacio;

  const filas = await tenantDb(businessId).$queryRaw<
    {
      cocineroId: string;
      cocinero: string | null;
      renglones: number;
      esperaSeg: number | null;
      preparacionSeg: number | null;
      medidosEspera: number;
      medidosPreparacion: number;
      relevados: number;
    }[]
  >`
    SELECT oi."startedById" AS "cocineroId",
           u."name"         AS "cocinero",
           COUNT(*)::int    AS "renglones",
           (AVG(EXTRACT(EPOCH FROM (oi."startedAt" - oi."sentToKitchenAt")))
             FILTER (WHERE oi."sentToKitchenAt" IS NOT NULL AND oi."startedAt" >= oi."sentToKitchenAt")
           )::float8 AS "esperaSeg",
           (AVG(EXTRACT(EPOCH FROM (oi."readyAt" - oi."startedAt")))
             FILTER (WHERE oi."readyAt" IS NOT NULL AND oi."readyAt" >= oi."startedAt")
           )::float8 AS "preparacionSeg",
           (COUNT(*)
             FILTER (WHERE oi."sentToKitchenAt" IS NOT NULL AND oi."startedAt" >= oi."sentToKitchenAt")
           )::int AS "medidosEspera",
           (COUNT(*)
             FILTER (WHERE oi."readyAt" IS NOT NULL AND oi."readyAt" >= oi."startedAt")
           )::int AS "medidosPreparacion",
           (COUNT(*)
             FILTER (WHERE oi."readyById" IS NOT NULL AND oi."readyById" <> oi."startedById")
           )::int AS "relevados"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    LEFT JOIN "User" u ON u."id" = oi."startedById"
    WHERE oi."businessId" = ${businessId}
      AND o."businessDate" >= ${comoFecha(periodo.desde)}::date
      AND o."businessDate" <= ${comoFecha(periodo.hasta)}::date
      AND oi."status" <> 'ANULADO'
      AND oi."startedById" IS NOT NULL
      AND oi."startedAt" IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 3 DESC
  `;

  const cocineros: TiemposDeCocinero[] = filas.map((f) => ({
    cocineroId: f.cocineroId,
    // La cuenta pudo darse de baja después; el trabajo del período sigue siendo
    // suyo y tiene que aparecer con algún nombre.
    cocinero: f.cocinero?.trim() || "Cuenta dada de baja",
    renglones: f.renglones,
    esperaPromedioMs: f.esperaSeg === null ? null : Math.round(f.esperaSeg * 1000),
    preparacionPromedioMs: f.preparacionSeg === null ? null : Math.round(f.preparacionSeg * 1000),
    medidosEspera: f.medidosEspera,
    medidosPreparacion: f.medidosPreparacion,
    relevados: f.relevados,
  }));

  return {
    kdsActivo,
    esperaPromedioMs: ponderar(cocineros, "esperaPromedioMs", "medidosEspera"),
    preparacionPromedioMs: ponderar(cocineros, "preparacionPromedioMs", "medidosPreparacion"),
    renglones: cocineros.reduce((n, c) => n + c.renglones, 0),
    medidosEspera: cocineros.reduce((n, c) => n + c.medidosEspera, 0),
    medidosPreparacion: cocineros.reduce((n, c) => n + c.medidosPreparacion, 0),
    cocineros,
  };
}

function ponderar(
  filas: readonly TiemposDeCocinero[],
  promedio: "esperaPromedioMs" | "preparacionPromedioMs",
  cuenta: "medidosEspera" | "medidosPreparacion",
): number | null {
  let suma = 0;
  let total = 0;
  for (const f of filas) {
    const p = f[promedio];
    if (p === null || f[cuenta] === 0) continue;
    suma += p * f[cuenta];
    total += f[cuenta];
  }
  return total === 0 ? null : Math.round(suma / total);
}
