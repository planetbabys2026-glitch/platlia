import "server-only";
import { tenantDb } from "@/lib/db/tenant";

// El valor por defecto vive en features/cocina/constantes.ts, sin "server-only",
// porque la pantalla lo necesita en el navegador. Se reexporta por comodidad.
export { MINUTOS_POR_DEFECTO } from "@/features/cocina/constantes";

/**
 * Las comandas vivas, agrupadas por estación.
 *
 * Solo lo que todavía no salió: pendiente y en preparación. Lo entregado
 * desaparece de la pantalla, porque una pantalla de cocina que acumula historia
 * deja de servir a los quince minutos.
 */
export async function getComandas(businessId: string) {
  const items = await tenantDb(businessId).orderItem.findMany({
    where: {
      status: { in: ["PENDIENTE", "EN_PREPARACION"] },
      order: { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
    },
    // El más viejo primero: en una cocina se despacha por orden de llegada.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nameSnapshot: true,
      quantity: true,
      notes: true,
      status: true,
      createdAt: true,
      sentToKitchenAt: true,
      product: { select: { kitchenStation: true, preparationMinutes: true } },
      order: {
        select: {
          id: true,
          code: true,
          type: true,
          turnNumber: true,
          table: { select: { name: true } },
        },
      },
    },
  });

  const estaciones = new Map<string, typeof items>();
  for (const item of items) {
    const estacion = item.product.kitchenStation?.trim() || "Sin estación";
    const actual = estaciones.get(estacion) ?? [];
    actual.push(item);
    estaciones.set(estacion, actual);
  }

  return [...estaciones.entries()]
    .map(([nombre, comandas]) => ({ nombre, comandas }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type Estacion = Awaited<ReturnType<typeof getComandas>>[number];
export type Comanda = Estacion["comandas"][number];
