import "server-only";
import { tenantDb } from "@/lib/db/tenant";
import { calcularStockDisponibleProducto } from "@/lib/inventory/stock";
import { margenPorcentual } from "@/lib/money";
import { getSettings } from "@/features/negocio/queries";

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
  businessDate: Date,
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
    order: { businessDate, status: "PAGADA" as const },
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
