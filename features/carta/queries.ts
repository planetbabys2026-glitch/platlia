import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/**
 * La carta como la ve quien administra: incluye lo agotado y lo que está fuera de
 * la carta del día, que es justo lo que hay que poder tocar. Lo archivado no
 * aparece: para eso está la historia de los pedidos.
 */
export async function getCartaAdmin(businessId: string) {
  return tenantDb(businessId).category.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      active: true,
      products: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          shortDescription: true,
          description: true,
          sku: true,
          imageUrl: true,
          priceCop: true,
          active: true,
          isAvailable: true,
          kitchenStation: true,
          preparationMinutes: true,
          taxRateId: true,
          taxRate: { select: { name: true, rateBp: true } },
          hasRecipe: true,
          recipeNeedsModifiers: true,
          // Con qué se diagnostica una receta cargada a medias: un producto que
          // declara escandallo sin renglones, o un grupo donde unas opciones
          // descuentan insumo y otras no. Las dos cosas se venden sin que nada
          // falle y sin mover el inventario.
          recipeItems: { select: { id: true } },
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            select: {
              groupId: true,
              required: true,
              group: {
                select: {
                  name: true,
                  options: {
                    where: { deletedAt: null, active: true },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                    select: { id: true, name: true, supplies: { select: { id: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/** Las tarifas de impuesto de la empresa, para el selector del producto. */
export async function getTarifas(businessId: string) {
  return tenantDb(businessId).taxRate.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, rateBp: true, isDefault: true },
  });
}

/** Áreas y mesas para la pantalla de administración del salón. */
export async function getSalonAdmin(businessId: string) {
  const db = tenantDb(businessId);

  const [areas, mesas] = await Promise.all([
    db.area.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    }),
    db.table.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, capacity: true, status: true, areaId: true },
    }),
  ]);

  return { areas, mesas };
}
