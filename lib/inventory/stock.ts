import type { TenantDb } from "@/lib/db/tenant";
import { ErrorDeUsuario } from "@/lib/actions/estado";
import {
  componerRecetaEfectiva,
  insumoQueFrena,
  porcionesSegunReceta,
  type OpcionConInsumos,
  type RenglonDeReceta,
} from "@/lib/inventory/receta";
import { costoUnitarioDeVenta } from "@/lib/inventory/costo";

/**
 * Prisma contesta P2025 cuando un `update` no encuentra la fila. Con la guarda de
 * stock en el `where`, eso significa exactamente "otro se llevó las últimas".
 *
 * Se identifica por el código y no importando el namespace `Prisma`: este archivo
 * lo comparten el servidor y los tests, y arrastrar el cliente base acá rompería
 * la regla de que solo `lib/db/` lo importa.
 */
function esFilaNoEncontrada(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

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
  /**
   * `BusinessSettings.permitirVentaSinStock`: deja pasar la venta aunque no
   * alcance, y el stock queda negativo. El negativo es el punto —es lo que el
   * arqueo tiene que ver—: dejarlo en cero escondería el faltante.
   */
  permitirVentaSinStock?: boolean;
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
export function calcularStockDisponibleProducto(
  prod: ProductoStockCalculo,
  inventoryEnabled: boolean = true,
): number | null {
  if (!inventoryEnabled) return null;

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
  inventoryEnabled: boolean = true,
): number | null {
  if (!inventoryEnabled) return null;

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
  costCop: true,
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
 * Devuelve el **costo unitario** de lo vendido, que es lo que el renglón congela
 * en `unitCostCopSnapshot`. Sale de acá y no de una segunda consulta porque el
 * producto y su receta ya están cargados: preguntarlos otra vez sería pagar dos
 * veces la misma lectura por cada renglón de cada pedido.
 *
 * `null` significa "no se conocía el costo" —inventario apagado, o producto sin
 * costear— y NO cero: un cero llega al informe como margen del 100%.
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
): Promise<{ unitCostCop: number | null }> {
  if (quantity <= 0) return { unitCostCop: null };

  const {
    referenceId,
    customNotes,
    inventoryEnabled = true,
    modifierOptionIds = [],
    permitirVentaSinStock = false,
  } = options ?? {};

  const resuelto = await resolverReceta(tx, productId, modifierOptionIds, true);
  if (!resuelto) return { unitCostCop: null };
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
  if (!inventoryEnabled) return { unitCostCop: null };

  const unitCostCop = costoUnitarioDeVenta({
    trackStock: producto.trackStock,
    costCop: producto.costCop ?? 0,
    receta,
  });

  // Los dos chequeos previos existen por el mensaje, no por la garantía: nombran
  // qué falta ("no hay pechuga") en vez de un "stock insuficiente" que manda a
  // alguien a revisar la bodega entera. La garantía real la da la guarda que va
  // en el `where` de cada update, más abajo.
  if (!permitirVentaSinStock) {
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
  }

  if (producto.trackStock) {
    // El descuento va con la guarda adentro del `where`, no después de un
    // chequeo: dos meseros agregando la última cerveza desde sus dos tablets
    // pasaban los dos la verificación y el stock terminaba en −1. Es el mismo
    // `updateMany` condicionado con el que se reclama un trabajo de impresión o
    // se evita la doble emisión ante la DIAN.
    let despues: { stockQty: number };
    try {
      despues = await tx.product.update({
        where: permitirVentaSinStock
          ? { id: producto.id }
          : { id: producto.id, stockQty: { gte: quantity } },
        data: { stockQty: { decrement: quantity } },
        select: { stockQty: true },
      });
    } catch (error) {
      if (esFilaNoEncontrada(error)) {
        throw new ErrorDeUsuario(
          `Se acabó "${producto.name}" mientras se agregaba al pedido. Revisá el stock antes de reintentar.`,
        );
      }
      throw error;
    }

    await tx.inventoryMovement.create({
      data: {
        businessId,
        productId: producto.id,
        type: "VENTA",
        quantity: -quantity,
        stockAfter: despues.stockQty,
        unitCostCop: producto.costCop ?? 0,
        referenceId: referenceId ?? null,
        notes: customNotes ?? `Venta de ${producto.name} x${quantity}`,
      },
    });
  }

  for (const renglon of receta) {
    const insumo = renglon.inventoryItem;
    const descuentoTotal = renglon.quantityRequired * quantity;

    let despues: { stockCurrent: number };
    try {
      despues = await tx.inventoryItem.update({
        where: permitirVentaSinStock
          ? { id: insumo.id }
          : { id: insumo.id, stockCurrent: { gte: descuentoTotal } },
        data: { stockCurrent: { decrement: descuentoTotal } },
        select: { stockCurrent: true },
      });
    } catch (error) {
      if (esFilaNoEncontrada(error)) {
        throw new ErrorDeUsuario(
          `Se acabó "${insumo.name}" mientras se preparaba "${producto.name}". Revisá el inventario antes de reintentar.`,
        );
      }
      throw error;
    }

    await tx.inventoryMovement.create({
      data: {
        businessId,
        inventoryItemId: insumo.id,
        type: "VENTA",
        quantity: -descuentoTotal,
        // El valor que devolvió el propio update, no una resta sobre la lectura
        // vieja: con dos ventas simultáneas esa resta escribía un saldo que nunca
        // existió, y el Kardex es justamente lo que se mira cuando no cuadra.
        stockAfter: despues.stockCurrent,
        unitCostCop: insumo.costCop ?? 0,
        referenceId: referenceId ?? null,
        notes: customNotes ?? `Venta de ${producto.name} x${quantity}`,
      },
    });
  }

  return { unitCostCop };
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
    const despues = await tx.product.update({
      where: { id: producto.id },
      data: { stockQty: { increment: quantity } },
      select: { stockQty: true },
    });

    await tx.inventoryMovement.create({
      data: {
        businessId,
        productId: producto.id,
        type: "DEVOLUCION",
        quantity,
        stockAfter: despues.stockQty,
        unitCostCop: producto.costCop ?? 0,
        referenceId: referenceId ?? null,
        notes: customNotes ?? `Devolución por anulación de ${producto.name} x${quantity}`,
      },
    });
  }

  for (const renglon of receta) {
    const insumo = renglon.inventoryItem;
    const reintegroTotal = renglon.quantityRequired * quantity;

    const despues = await tx.inventoryItem.update({
      where: { id: insumo.id },
      data: { stockCurrent: { increment: reintegroTotal } },
      select: { stockCurrent: true },
    });

    await tx.inventoryMovement.create({
      data: {
        businessId,
        inventoryItemId: insumo.id,
        type: "DEVOLUCION",
        quantity: reintegroTotal,
        stockAfter: despues.stockCurrent,
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
): Promise<{ unitCostCop: number | null }> {
  const diferencia = cantidadNueva - cantidadAnterior;
  if (diferencia === 0) return { unitCostCop: null };

  if (diferencia > 0) {
    return verificarYDescontarStockReceta(tx, businessId, productId, diferencia, {
      ...options,
      customNotes: options?.customNotes ?? `Aumento de cantidad en pedido x${diferencia}`,
    });
  }

  const reintegro = Math.abs(diferencia);
  await restaurarStockReceta(tx, businessId, productId, reintegro, {
    ...options,
    customNotes: options?.customNotes ?? `Reducción de cantidad en pedido x${reintegro}`,
  });
  return { unitCostCop: null };
}
