import "server-only";
import { tenantDb } from "@/lib/db/tenant";

export async function getInventoryItems(businessId: string) {
  return tenantDb(businessId).inventoryItem.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      recipeItems: {
        include: {
          product: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function getSuppliers(businessId: string) {
  return tenantDb(businessId).supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { invoices: true } },
    },
  });
}

export async function getCategories(businessId: string) {
  return tenantDb(businessId).category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

export async function getPurchaseInvoices(businessId: string) {
  return tenantDb(businessId).purchaseInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      supplier: { select: { id: true, name: true, taxId: true } },
      items: {
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true } },
        },
      },
    },
    take: 100,
  });
}

/**
 * Los productos de reventa: los que se compran y se venden tal cual.
 *
 * Filtra por `hasRecipe: false` —el complemento exacto de `getProductRecipes`—
 * así que un plato con escandallo no aparece acá pidiendo un stock propio que no
 * le corresponde. El costo sale de `Product.costCop` y no de `recipeItems[0]`,
 * que solo acertaba en el caso 1:1 y daba cero en cualquier otro.
 */
export async function getFinishedProducts(businessId: string) {
  return tenantDb(businessId).product.findMany({
    where: { deletedAt: null, active: true, hasRecipe: false },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sku: true,
      priceCop: true,
      imageUrl: true,
      trackStock: true,
      stockQty: true,
      stockMin: true,
      costCop: true,
      isAvailable: true,
      category: {
        select: { id: true, name: true },
      },
    },
  });
}

/**
 * Los productos que llevan escandallo.
 *
 * Filtra por `hasRecipe`: antes listaba todos los productos activos, así que la
 * pestaña se llenaba de cervezas y gaseosas que nunca van a tener receta y había
 * que buscar los platos entre ellas. Marcar la casilla en la carta es lo que
 * mete un producto acá.
 */
export async function getProductRecipes(businessId: string) {
  const [products, inventoryItems] = await Promise.all([
    tenantDb(businessId).product.findMany({
      where: { deletedAt: null, active: true, hasRecipe: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        priceCop: true,
        hasRecipe: true,
        recipeNeedsModifiers: true,
        category: { select: { name: true } },
        recipeItems: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, unit: true, costCop: true, stockCurrent: true },
            },
          },
        },
        // Los insumos que aportan los modificadores, para que el costo del plato
        // se entienda completo. Se muestran en solo lectura: se editan donde se
        // definen, en Carta → Modificadores.
        modifierGroups: {
          where: { group: { deletedAt: null, active: true } },
          orderBy: { sortOrder: "asc" },
          select: {
            required: true,
            group: {
              select: {
                id: true,
                name: true,
                minSelect: true,
                maxSelect: true,
                options: {
                  where: { deletedAt: null, active: true },
                  orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                  select: {
                    id: true,
                    name: true,
                    priceDeltaCop: true,
                    supplies: {
                      select: {
                        quantityRequired: true,
                        inventoryItem: {
                          select: {
                            id: true,
                            name: true,
                            unit: true,
                            costCop: true,
                            stockCurrent: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    tenantDb(businessId).inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, costCop: true },
    }),
  ]);

  return { products, inventoryItems };
}

/**
 * Cuánto vale lo que hay en el local y cuánto está por debajo del mínimo.
 *
 * Suma los **dos** regímenes: los insumos de receta y los productos de reventa
 * con stock directo. Antes contaba solo los primeros, y como el alta de una
 * bebida fabricaba un insumo espejo que nunca se descontaba, la valorización
 * subía con cada compra y no bajaba nunca con las ventas.
 */
export async function getInventorySummary(businessId: string) {
  const db = tenantDb(businessId);

  const [items, productos] = await Promise.all([
    db.inventoryItem.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stockCurrent: true,
        stockMin: true,
        costCop: true,
      },
    }),
    db.product.findMany({
      where: { deletedAt: null, active: true, trackStock: true, hasRecipe: false },
      select: { id: true, stockQty: true, stockMin: true, costCop: true },
    }),
  ]);

  let valorTotalCOP = 0;
  let bajoStockCount = 0;

  for (const item of items) {
    valorTotalCOP += item.stockCurrent * item.costCop;
    if (item.stockCurrent <= item.stockMin) {
      bajoStockCount++;
    }
  }

  for (const prod of productos) {
    valorTotalCOP += Math.max(0, prod.stockQty) * prod.costCop;
    if (prod.stockQty <= prod.stockMin) {
      bajoStockCount++;
    }
  }

  return {
    totalItems: items.length + productos.length,
    valorTotalCOP,
    bajoStockCount,
    items,
  };
}
