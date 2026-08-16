import type { TenantDb } from "@/lib/db/tenant";
import { ErrorDeUsuario } from "@/lib/actions/estado";
import {
  componerRecetaEfectiva,
  insumoQueFrena,
  porcionesSegunReceta,
  type OpcionConInsumos,
  type RenglonDeReceta,
} from "@/lib/inventory/receta";

type TxClient = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

interface StockOptions {
  referenceId?: string | null;
  customNotes?: string;
  inventoryEnabled?: boolean;
  /**
   * Las opciones elegidas para este renglón. Sin esto, un menú del día con carne
   * descontaría el arroz de la receta base y no la carne.
   */
  modifierOptionIds?: string[];
}

export interface ProductoStockCalculo {
  trackStock?: boolean;
  stockQty?: number;
  hasRecipe?: boolean;
  recipeNeedsModifiers?: boolean;
  recipeItems?: RenglonDeReceta[];
  /**
   * Los grupos asignados, para poder estimar el techo de un producto cuya receta
   * todavía no está decidida.
   */
  modifierGroups?: Array<{
    required: boolean;
    group: { options: OpcionConInsumos[] };
  }>;
}

/**
 * Cuántas porciones o unidades de un producto se pueden preparar hoy.
 *
 * Retorna `null` si el producto no rastrea ni receta ni stock directo: ese
 * producto no se cuenta, y pintar "0 disponibles" sería mentir.
 *
 * Para un producto cuya receta depende de los modificadores, esto es un techo
 * **optimista**: cruza la receta base con la mejor opción disponible de cada
 * grupo obligatorio, porque el cliente todavía puede elegir la proteína que sí
 * hay. Decir "0 disponibles" porque se acabó el pollo escondería un plato que se
 * vende perfecto con carne. La cuenta exacta se hace dentro del modal, donde ya
 * se sabe qué se eligió, y la definitiva la hace el servidor al descontar.
 */
export function calcularStockDisponibleProducto(prod: ProductoStockCalculo): number | null {
  const recetaBase = componerRecetaEfectiva(prod, []);

  let porcionesReceta = porcionesSegunReceta(recetaBase);

  // Cada grupo obligatorio con insumos recorta el techo: hay que poder servir
  // al menos una de sus opciones.
  for (const asignado of prod.modifierGroups ?? []) {
    if (!asignado.required) continue;

    let mejorDelGrupo: number | null = null;
    for (const opcion of asignado.group.options) {
      if (!opcion.supplies || opcion.supplies.length === 0) {
        // Una opción sin insumos ("término medio") nunca limita nada.
        mejorDelGrupo = null;
        break;
      }
      const porciones = porcionesSegunReceta(componerRecetaEfectiva(prod, [opcion]));
      if (porciones === null) continue;
      if (mejorDelGrupo === null || porciones > mejorDelGrupo) mejorDelGrupo = porciones;
    }

    if (mejorDelGrupo !== null) {
      porcionesReceta = porcionesReceta === null ? mejorDelGrupo : Math.min(porcionesReceta, mejorDelGrupo);
    }
  }

  const porcionesProducto =
    prod.trackStock && typeof prod.stockQty === "number" ? Math.max(0, prod.stockQty) : null;

  if (porcionesReceta !== null && porcionesProducto !== null) {
    return Math.min(porcionesReceta, porcionesProducto);
  }
  if (porcionesReceta !== null) return porcionesReceta;
  if (porcionesProducto !== null) return porcionesProducto;

  return null;
}

/**
 * Cuántas porciones alcanzan para una combinación concreta ya elegida.
 *
 * Es lo que el modal usa para deshabilitar "Pollo" cuando se acabó la pechuga,
 * dejando "Carne" tocable.
 */
export function calcularStockDisponibleCombinacion(
  prod: ProductoStockCalculo,
  opcionesElegidas: OpcionConInsumos[],
): number | null {
  const porcionesReceta = porcionesSegunReceta(componerRecetaEfectiva(prod, opcionesElegidas));
  const porcionesProducto =
    prod.trackStock && typeof prod.stockQty === "number" ? Math.max(0, prod.stockQty) : null;

  if (porcionesReceta !== null && porcionesProducto !== null) {
    return Math.min(porcionesReceta, porcionesProducto);
  }
  if (porcionesReceta !== null) return porcionesReceta;
  return porcionesProducto;
}

export interface CartItemParaStock {
  productId: string;
  name: string;
  quantity: number;
  /** Las opciones elegidas en ese renglón del carrito. */
  opciones?: OpcionConInsumos[];
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
 * Audita si la demanda acumulada de todo el carrito excede el stock actual.
 *
 * Acumula por insumo antes de comparar: tres platos que comparten la misma salsa
 * se revisan juntos. Verificar renglón por renglón dejaría pasar un pedido que
 * en total no se puede preparar, que es justo el pedido grande donde más duele.
 *
 * Devuelve el mensaje de error o `null` si alcanza para todo.
 */
export function auditarStockCarritoRecetas(
  cart: CartItemParaStock[],
  carta: CategoriaConProductos[],
  inventoryEnabled: boolean = true,
): string | null {
  if (!inventoryEnabled || cart.length === 0) return null;

  const productosMap = new Map<string, ProductoStockCalculo & { id: string; name: string }>();
  for (const cat of carta) {
    for (const prod of cat.products) productosMap.set(prod.id, prod);
  }

  const demandaPorInsumo = new Map<
    string,
    { name: string; unit: string; requeridoTotal: number; stockCurrent: number }
  >();

  for (const item of cart) {
    const prod = productosMap.get(item.productId);
    if (!prod) continue;

    if (prod.trackStock && typeof prod.stockQty === "number") {
      if (item.quantity > prod.stockQty) {
        return `Stock insuficiente del producto "${prod.name}". Solicitados: ${item.quantity}, disponibles: ${prod.stockQty}.`;
      }
    }

    for (const renglon of componerRecetaEfectiva(prod, item.opciones ?? [])) {
      const insumo = renglon.inventoryItem;
      const demanda = renglon.quantityRequired * item.quantity;
      const actual = demandaPorInsumo.get(insumo.id);

      if (actual) {
        actual.requeridoTotal += demanda;
      } else {
        demandaPorInsumo.set(insumo.id, {
          name: insumo.name,
          unit: insumo.unit,
          requeridoTotal: demanda,
          stockCurrent: insumo.stockCurrent,
        });
      }
    }
  }

  for (const [, insumo] of demandaPorInsumo) {
    if (insumo.requeridoTotal > insumo.stockCurrent) {
      return `Stock insuficiente del insumo "${insumo.name}" para preparar los productos del pedido. Requerido total: ${insumo.requeridoTotal} ${insumo.unit}, disponible en inventario: ${insumo.stockCurrent} ${insumo.unit}.`;
    }
  }

  return null;
}

/** Lo que hay que leer de un producto para poder descontarle stock. */
const SELECT_PARA_DESCUENTO = {
  id: true,
  name: true,
  trackStock: true,
  stockQty: true,
  hasRecipe: true,
  recipeNeedsModifiers: true,
  recipeItems: {
    include: {
      inventoryItem: {
        select: { id: true, name: true, unit: true, stockCurrent: true, costCop: true },
      },
    },
  },
} as const;

/**
 * Carga el producto y arma la receta que corresponde a las opciones elegidas.
 *
 * Las opciones se leen de la base, nunca del cliente: lo único que llega de
 * afuera son los ids. Si el precio o el insumo de "Carne" cambió hace un minuto,
 * lo que vale es lo que dice la tabla.
 */
async function resolverReceta(
  tx: TxClient,
  productId: string,
  modifierOptionIds: string[],
  exigirProducto: boolean,
) {
  const producto = await tx.product.findFirst({
    where: { id: productId, ...(exigirProducto ? { deletedAt: null } : {}) },
    select: SELECT_PARA_DESCUENTO,
  });

  if (!producto) {
    if (exigirProducto) throw new ErrorDeUsuario("El producto especificado no existe.");
    return null;
  }

  const opciones: OpcionConInsumos[] =
    modifierOptionIds.length === 0
      ? []
      : (
          await tx.modifierOption.findMany({
            where: { id: { in: modifierOptionIds } },
            select: {
              id: true,
              name: true,
              supplies: {
                select: {
                  quantityRequired: true,
                  inventoryItem: {
                    select: { id: true, name: true, unit: true, stockCurrent: true, costCop: true },
                  },
                },
              },
            },
          })
        ).map((o) => ({ id: o.id, name: o.name, supplies: o.supplies }));

  return { producto, receta: componerRecetaEfectiva(producto, opciones) };
}

/**
 * Verifica disponibilidad y descuenta: insumos de la receta efectiva y/o stock
 * directo del producto. Registra el Kardex de VENTA.
 *
 * Si algo no alcanza lanza `ErrorDeUsuario` nombrando el insumo que frena, sin
 * haber escrito nada: la transacción de quien llama se encarga del resto.
 */
export async function verificarYDescontarStockReceta(
  tx: TxClient,
  businessId: string,
  productId: string,
  quantity: number,
  options?: StockOptions,
) {
  if (quantity <= 0) return;

  const { referenceId, customNotes, inventoryEnabled = true, modifierOptionIds = [] } = options ?? {};

  const resuelto = await resolverReceta(tx, productId, modifierOptionIds, true);
  if (!resuelto) return;
  const { producto, receta } = resuelto;

  // Un producto cuya receta depende de lo que se elija no se puede vender sin
  // que se haya elegido: descontaría de menos y dejaría el inventario mintiendo.
  // La interfaz ya lo impide con el modal; esto cubre el POST directo.
  if (producto.recipeNeedsModifiers && modifierOptionIds.length === 0) {
    throw new ErrorDeUsuario(
      `Elegí los modificadores de "${producto.name}" antes de agregarlo al pedido.`,
    );
  }

  // Si el negocio no lleva inventario activo, el stock no se audita ni se descuenta en la venta.
  if (!inventoryEnabled) return;

  if (producto.trackStock && producto.stockQty < quantity) {
    throw new ErrorDeUsuario(
      `Stock insuficiente de "${producto.name}". Disponibles: ${producto.stockQty}, solicitados: ${quantity}.`,
    );
  }

  const frena = insumoQueFrena(receta, quantity);
  if (frena) {
    throw new ErrorDeUsuario(
      `Stock insuficiente del insumo "${frena.insumo.name}" para preparar "${producto.name}". Requerido: ${frena.requerido} ${frena.insumo.unit}, disponible en inventario: ${frena.insumo.stockCurrent} ${frena.insumo.unit}.`,
    );
  }

  if (producto.trackStock) {
    await tx.product.update({
      where: { id: producto.id },
      data: { stockQty: { decrement: quantity } },
    });
  }

  for (const renglon of receta) {
    const insumo = renglon.inventoryItem;
    const descuentoTotal = renglon.quantityRequired * quantity;
    const nuevoStock = insumo.stockCurrent - descuentoTotal;

    await tx.inventoryItem.update({
      where: { id: insumo.id },
      data: { stockCurrent: { decrement: descuentoTotal } },
    });

    await tx.inventoryMovement.create({
      data: {
        businessId,
        inventoryItemId: insumo.id,
        type: "VENTA",
        quantity: -descuentoTotal,
        stockAfter: nuevoStock,
        unitCostCop: insumo.costCop ?? 0,
        referenceId: referenceId ?? null,
        notes: customNotes ?? `Venta de ${producto.name} x${quantity}`,
      },
    });
  }
}

/**
 * Devuelve el stock cuando un renglón o un pedido se anula o se elimina.
 *
 * Recibe las mismas opciones que se descontaron: reintegrar solo la receta base
 * de un plato que llevaba carne dejaría la res perdida para siempre.
 */
export async function restaurarStockReceta(
  tx: TxClient,
  businessId: string,
  productId: string,
  quantity: number,
  options?: StockOptions,
) {
  if (quantity <= 0) return;

  const { referenceId, customNotes, inventoryEnabled = true, modifierOptionIds = [] } = options ?? {};

  if (!inventoryEnabled) return;

  const resuelto = await resolverReceta(tx, productId, modifierOptionIds, false);
  if (!resuelto) return;
  const { producto, receta } = resuelto;

  if (producto.trackStock) {
    await tx.product.update({
      where: { id: producto.id },
      data: { stockQty: { increment: quantity } },
    });
  }

  for (const renglon of receta) {
    const insumo = renglon.inventoryItem;
    const reintegroTotal = renglon.quantityRequired * quantity;
    const nuevoStock = insumo.stockCurrent + reintegroTotal;

    await tx.inventoryItem.update({
      where: { id: insumo.id },
      data: { stockCurrent: { increment: reintegroTotal } },
    });

    await tx.inventoryMovement.create({
      data: {
        businessId,
        inventoryItemId: insumo.id,
        type: "DEVOLUCION",
        quantity: reintegroTotal,
        stockAfter: nuevoStock,
        unitCostCop: insumo.costCop ?? 0,
        referenceId: referenceId ?? null,
        notes: customNotes ?? `Devolución por anulación de ${producto.name} x${quantity}`,
      },
    });
  }
}

/**
 * Ajusta el stock cuando cambia la cantidad de un renglón: descuenta la
 * diferencia o reintegra el sobrante, según el signo.
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
