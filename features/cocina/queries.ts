import "server-only";
import { tenantDb } from "@/lib/db/tenant";

// El valor por defecto vive en features/cocina/constantes.ts, sin "server-only",
// porque la pantalla lo necesita en el navegador. Se reexporta por comodidad.
export { MINUTOS_POR_DEFECTO } from "@/features/cocina/constantes";

export type ComandaItem = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  notes: string | null;
  status: string;
  preparationMinutes: number | null;
};

export type ComandaOrden = {
  id: string;
  orderId: string;
  code: number;
  mesa: string | null;
  turno: number | null;
  type: string;
  desde: number;
  items: ComandaItem[];
};

export type EstacionGroup = {
  nombre: string;
  comandas: ComandaOrden[];
};

/**
 * Las comandas vivas, agrupadas por estación y por pedido/mesa.
 *
 * Junta todos los productos de la misma mesa/pedido en 1 sola comanda para la cocina,
 * mostrando claramente las notas por producto y permitiendo gestionar el avance.
 */
export async function getComandas(businessId: string, businessDate: Date): Promise<EstacionGroup[]> {
  const items = await tenantDb(businessId).orderItem.findMany({
    where: {
      status: { in: ["PENDIENTE", "EN_PREPARACION", "LISTO"] },
      order: {
        businessDate,
        OR: [
          { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
          { status: "PAGADA", type: { not: "MESA" } },
        ],
      },
    },
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

  const estacionesMap = new Map<string, Map<string, ComandaOrden>>();

  for (const item of items) {
    const estacion = item.product.kitchenStation?.trim() || "Sin estación";
    let ordenesMap = estacionesMap.get(estacion);
    if (!ordenesMap) {
      ordenesMap = new Map<string, ComandaOrden>();
      estacionesMap.set(estacion, ordenesMap);
    }

    const orderId = item.order.id;
    let comandaOrden = ordenesMap.get(orderId);
    const itemDesde = (item.sentToKitchenAt ?? item.createdAt).getTime();

    if (!comandaOrden) {
      comandaOrden = {
        id: `${estacion}-${orderId}`,
        orderId: item.order.id,
        code: item.order.code,
        mesa: item.order.table?.name ?? null,
        turno: item.order.turnNumber,
        type: item.order.type,
        desde: itemDesde,
        items: [],
      };
      ordenesMap.set(orderId, comandaOrden);
    } else {
      if (itemDesde < comandaOrden.desde) {
        comandaOrden.desde = itemDesde;
      }
    }

    comandaOrden.items.push({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      notes: item.notes,
      status: item.status,
      preparationMinutes: item.product.preparationMinutes,
    });
  }

  return [...estacionesMap.entries()]
    .map(([nombre, ordenesMap]) => ({
      nombre,
      comandas: [...ordenesMap.values()],
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type Estacion = Awaited<ReturnType<typeof getComandas>>[number];
export type Comanda = Estacion["comandas"][number];
