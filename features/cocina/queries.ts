import "server-only";
import { tenantDb } from "@/lib/db/tenant";

// El valor por defecto vive en features/cocina/constantes.ts, sin "server-only",
// porque la pantalla lo necesita en el navegador. Se reexporta por comodidad.
export { MINUTOS_POR_DEFECTO } from "@/features/cocina/constantes";

/**
 * Las comandas vivas, agrupadas por estación.
 *
 * Incluye las que ya están LISTAS: si desaparecieran al marcarlas, nadie podría
 * marcarlas entregadas y el plato quedaría para siempre "listo" en la base. Lo
 * entregado sí desaparece, porque una pantalla de cocina que acumula historia
 * deja de servir a los quince minutos.
 */
export async function getComandas(businessId: string, businessDate: Date) {
  const items = await tenantDb(businessId).orderItem.findMany({
    where: {
      status: { in: ["PENDIENTE", "EN_PREPARACION", "LISTO"] },
      // Solo la jornada en curso: un renglón de anteayer no es trabajo de la
      // cocina de hoy, es basura que tapa lo que sí hay que cocinar.
      order: {
        businessDate,
        OR: [
          { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
          // Para llevar se paga por adelantado y la comida sigue en el fuego. En
          // mesa se paga al final: si el pedido está pagado, ya comieron.
          { status: "PAGADA", type: { not: "MESA" } },
        ],
      },
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
