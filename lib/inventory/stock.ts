import type { TenantDb } from "@/lib/db/tenant";
import { ErrorDeUsuario } from "@/lib/actions/estado";

type TxClient = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

interface StockOptions {
  referenceId?: string | null;
  customNotes?: string;
  inventoryEnabled?: boolean;
}

export interface ProductoStockCalculo {
  trackStock?: boolean;
  stockQty?: number;
  recipeItems?: Array<{
    quantityRequired: number;
    inventoryItem: {
      stockCurrent: number;
    };
  }>;
}

/**
 * Calcula la cantidad máxima de porciones o unidades preparables de un producto
 * con base en el stock actual de insumos de su receta y/o stock directo.
 *
 * Retorna `null` si el producto no rastrea receta ni stock directo.
 */
export function calcularStockDisponibleProducto(prod: ProductoStockCalculo): number | null {
  let porcionesReceta: number | null = null;
  let porcionesProducto: number | null = null;

  if (prod.recipeItems && prod.recipeItems.length > 0) {
    let minPorciones = Infinity;
    for (const r of prod.recipeItems) {
      if (r.quantityRequired > 0 && r.inventoryItem) {
        const porciones = Math.floor(r.inventoryItem.stockCurrent / r.quantityRequired);
        if (porciones < minPorciones) {
          minPorciones = porciones;
        }
      }
    }
    porcionesReceta = minPorciones === Infinity ? null : Math.max(0, minPorciones);
  }

  if (prod.trackStock && typeof prod.stockQty === "number") {
    porcionesProducto = Math.max(0, prod.stockQty);
  }

  if (porcionesReceta !== null && porcionesProducto !== null) {
    return Math.min(porcionesReceta, porcionesProducto);
  }
  if (porcionesReceta !== null) return porcionesReceta;
  if (porcionesProducto !== null) return porcionesProducto;

  return null;
}

export interface CartItemParaStock {
  productId: string;
  name: string;
  quantity: number;
}

export interface CategoriaConProductos {
  products: Array<
    ProductoStockCalculo & {
      id: string;
      name: string;
    }
  >;
}

/**
 * Audita si la demanda acumulada de insumos de todo el carrito excede el stock actual en inventario.
 * Retorna `null` si hay stock suficiente para preparar todo el pedido, o un mensaje de error si falta stock.
 */
export function auditarStockCarritoRecetas(
  cart: CartItemParaStock[],
  carta: CategoriaConProductos[],
  inventoryEnabled: boolean = true,
): string | null {
  if (cart.length === 0) return null;

  const insumosDemandadosMap = new Map<
    string,
    { name: string; unit: string; requeridoTotal: number; stockCurrent: number }
  >();

  const productosMap = new Map<
    string,
    ProductoStockCalculo & { id: string; name: string }
  >();

  for (const cat of carta) {
    for (const prod of cat.products) {
      productosMap.set(prod.id, prod);
    }
  }

  for (const item of cart) {
    const prod = productosMap.get(item.productId);
    if (!prod) continue;

    // 1. Chequear stock directo si aplica
    if (prod.trackStock && typeof prod.stockQty === "number") {
      if (item.quantity > prod.stockQty) {
        return `Stock insuficiente del producto "${prod.name}". Solicitados: ${item.quantity}, disponibles: ${prod.stockQty}.`;
      }
    }

    // 2. Acumular demanda de insumos de recetas
    if (inventoryEnabled && prod.recipeItems && prod.recipeItems.length > 0) {
      for (const r of prod.recipeItems) {
        const ins = r.inventoryItem as { id?: string; name?: string; unit?: string; stockCurrent?: number } | undefined;
        if (!ins || !ins.id) continue;

        const demanda = r.quantityRequired * item.quantity;
        const actual = insumosDemandadosMap.get(ins.id);

        if (actual) {
          actual.requeridoTotal += demanda;
        } else {
          insumosDemandadosMap.set(ins.id, {
            name: ins.name ?? "Insumo",
            unit: ins.unit ?? "UNIDAD",
            requeridoTotal: demanda,
            stockCurrent: ins.stockCurrent ?? 0,
          });
        }
      }
    }
  }

  // 3. Verificar si la demanda total de algún insumo excede el stock disponible
  for (const [, insumo] of insumosDemandadosMap) {
    if (insumo.requeridoTotal > insumo.stockCurrent) {
      return `Stock insuficiente del insumo "${insumo.name}" para preparar los productos del pedido. Requerido total: ${insumo.requeridoTotal} ${insumo.unit}, disponible en inventario: ${insumo.stockCurrent} ${insumo.unit}.`;
    }
  }

  return null;
}

/**
 * Verifica la disponibilidad de insumos de receta y/o stock directo del producto.
 * Si el stock de algún insumo o producto es insuficiente, lanza un ErrorDeUsuario descriptivo.
 * Si todo está correcto, descuenta el stock y registra los movimientos Kardex de VENTA.
 */
export async function verificarYDescontarStockReceta(
  tx: TxClient,
  businessId: string,
  productId: string,
  quantity: number,
  options?: StockOptions,
) {
  if (quantity <= 0) return;

  const { referenceId, customNotes, inventoryEnabled = true } = options ?? {};

  const producto = await tx.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      name: true,
      trackStock: true,
      stockQty: true,
      recipeItems: {
        include: {
          inventoryItem: {
            select: { id: true, name: true, unit: true, stockCurrent: true, costCop: true },
          },
        },
      },
    },
  });

  if (!producto) {
    throw new ErrorDeUsuario("El producto especificado no existe.");
  }

  // 1. Verificar stock directo del producto si trackStock está activo
  if (producto.trackStock && producto.stockQty < quantity) {
    throw new ErrorDeUsuario(
      `Stock insuficiente de "${producto.name}". Disponibles: ${producto.stockQty}, solicitados: ${quantity}.`,
    );
  }

  // 2. Verificar disponibilidad de insumos de la receta si la gestión de inventario está activa
  if (inventoryEnabled && producto.recipeItems.length > 0) {
    for (const r of producto.recipeItems) {
      const insumo = r.inventoryItem;
      const requeridoTotal = r.quantityRequired * quantity;
      if (insumo.stockCurrent < requeridoTotal) {
        throw new ErrorDeUsuario(
          `Stock insuficiente del insumo "${insumo.name}" para preparar "${producto.name}". Requerido: ${requeridoTotal} ${insumo.unit}, disponible en inventario: ${insumo.stockCurrent} ${insumo.unit}.`,
        );
      }
    }
  }

  // 3. Descontar stock directo del producto
  if (producto.trackStock) {
    await tx.product.update({
      where: { id: producto.id },
      data: { stockQty: { decrement: quantity } },
    });
  }

  // 4. Descontar insumos de la receta y registrar movimiento Kardex de VENTA
  if (inventoryEnabled && producto.recipeItems.length > 0) {
    for (const r of producto.recipeItems) {
      const insumo = r.inventoryItem;
      const descuentoTotal = r.quantityRequired * quantity;
      const nuevoStock = insumo.stockCurrent - descuentoTotal;

      await tx.inventoryItem.update({
        where: { id: insumo.id },
        data: { stockCurrent: nuevoStock },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId,
          inventoryItemId: insumo.id,
          type: "VENTA",
          quantity: -descuentoTotal,
          stockAfter: nuevoStock,
          unitCostCop: insumo.costCop,
          referenceId: referenceId ?? null,
          notes: customNotes ?? `Venta de ${producto.name} x${quantity}`,
        },
      });
    }
  }
}

/**
 * Restaura / devuelve el stock de insumos de receta y/o producto directo cuando un ítem o pedido es anulado o eliminado.
 */
export async function restaurarStockReceta(
  tx: TxClient,
  businessId: string,
  productId: string,
  quantity: number,
  options?: StockOptions,
) {
  if (quantity <= 0) return;

  const { referenceId, customNotes, inventoryEnabled = true } = options ?? {};

  const producto = await tx.product.findFirst({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      trackStock: true,
      recipeItems: {
        include: {
          inventoryItem: {
            select: { id: true, name: true, unit: true, stockCurrent: true, costCop: true },
          },
        },
      },
    },
  });

  if (!producto) return;

  // 1. Restaurar stock directo si aplica
  if (producto.trackStock) {
    await tx.product.update({
      where: { id: producto.id },
      data: { stockQty: { increment: quantity } },
    });
  }

  // 2. Restaurar insumos de la receta y registrar Kardex de DEVOLUCION
  if (inventoryEnabled && producto.recipeItems.length > 0) {
    for (const r of producto.recipeItems) {
      const insumo = r.inventoryItem;
      const reintegroTotal = r.quantityRequired * quantity;
      const nuevoStock = insumo.stockCurrent + reintegroTotal;

      await tx.inventoryItem.update({
        where: { id: insumo.id },
        data: { stockCurrent: nuevoStock },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId,
          inventoryItemId: insumo.id,
          type: "DEVOLUCION",
          quantity: reintegroTotal,
          stockAfter: nuevoStock,
          unitCostCop: insumo.costCop,
          referenceId: referenceId ?? null,
          notes: customNotes ?? `Devolución por anulación de ${producto.name} x${quantity}`,
        },
      });
    }
  }
}

/**
 * Ajusta el stock de un renglón cuando cambia su cantidad.
 * Si la nueva cantidad es mayor, valida disponibilidad y descuenta la diferencia.
 * Si la nueva cantidad es menor, reintegra la diferencia sobrante.
 */
export async function ajustarStockCantidadReceta(
  tx: TxClient,
  businessId: string,
  productId: string,
  cantidadAnterior: number,
  cantidadNueva: number,
  options?: StockOptions,
) {
  const diferencia = cantidadNueva - cantidadAnterior;
  if (diferencia === 0) return;

  if (diferencia > 0) {
    await verificarYDescontarStockReceta(tx, businessId, productId, diferencia, {
      ...options,
      customNotes: options?.customNotes ?? `Aumento de cantidad en pedido x${diferencia}`,
    });
  } else {
    const reintegro = Math.abs(diferencia);
    await restaurarStockReceta(tx, businessId, productId, reintegro, {
      ...options,
      customNotes: options?.customNotes ?? `Reducción de cantidad en pedido x${reintegro}`,
    });
  }
}
