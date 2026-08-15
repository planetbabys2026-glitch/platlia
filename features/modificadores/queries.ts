import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/** Lo que necesita el modal de venta para pintar y cotizar una opción. */
const SELECT_OPCION = {
  id: true,
  name: true,
  priceDeltaCop: true,
  isDefault: true,
  sortOrder: true,
  supplies: {
    select: {
      quantityRequired: true,
      inventoryItem: {
        select: { id: true, name: true, unit: true, stockCurrent: true, costCop: true },
      },
    },
  },
} as const;

/** La biblioteca completa, para administrarla. */
export async function getModificadoresAdmin(businessId: string) {
  const [grupos, inventoryItems] = await Promise.all([
    tenantDb(businessId).modifierGroup.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        helpText: true,
        minSelect: true,
        maxSelect: true,
        sortOrder: true,
        active: true,
        options: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: SELECT_OPCION,
        },
        _count: { select: { products: true } },
      },
    }),
    tenantDb(businessId).inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, costCop: true },
    }),
  ]);

  return { grupos, inventoryItems };
}

/**
 * Los grupos disponibles para asignar a un producto, con lo mínimo para
 * listarlos con una casilla al lado.
 */
export async function getGruposParaAsignar(businessId: string) {
  return tenantDb(businessId).modifierGroup.findMany({
    where: { deletedAt: null, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      minSelect: true,
      maxSelect: true,
      _count: { select: { options: true } },
    },
  });
}

export type ModificadoresAdmin = Awaited<ReturnType<typeof getModificadoresAdmin>>;
export type GrupoParaAsignar = Awaited<ReturnType<typeof getGruposParaAsignar>>[number];
