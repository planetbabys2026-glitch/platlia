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

export async function getProductRecipes(businessId: string) {
  const [products, inventoryItems] = await Promise.all([
    tenantDb(businessId).product.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        priceCop: true,
        category: { select: { name: true } },
        recipeItems: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, unit: true, costCop: true, stockCurrent: true },
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

export async function getInventorySummary(businessId: string) {
  const items = await tenantDb(businessId).inventoryItem.findMany({
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
  });

  let valorTotalCOP = 0;
  let bajoStockCount = 0;

  for (const item of items) {
    valorTotalCOP += item.stockCurrent * item.costCop;
    if (item.stockCurrent <= item.stockMin) {
      bajoStockCount++;
    }
  }

  return {
    totalItems: items.length,
    valorTotalCOP,
    bajoStockCount,
    items,
  };
}
