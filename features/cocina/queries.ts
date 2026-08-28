import "server-only";
import { OrderItemStatus, OrderStatus, OrderType } from "@/generated/prisma/enums";
import { tenantDb } from "@/lib/db/tenant";

/**
 * Qué renglón está en manos de la cocina: ya se envió y todavía no se entregó.
 *
 * Vive suelto para que `getComandas` y `contarComandasVivas` no puedan
 * divergir: si la pantalla y la insignia del menú no filtran igual, el número
 * del menú miente sobre lo que se va a ver al entrar, que es peor que no tener
 * número.
 */
const RENGLON_EN_COCINA = {
  status: { in: [OrderItemStatus.PENDIENTE, OrderItemStatus.EN_PREPARACION, OrderItemStatus.LISTO] },
  sentToKitchenAt: { not: null },
};

/**
 * Un pedido de mesa deja de importarle a la cocina cuando se cierra; uno sin
 * mesa, no: se paga por adelantado y hay que prepararlo igual.
 */
const PEDIDO_QUE_LE_IMPORTA_A_COCINA = [
  { status: { in: [OrderStatus.ABIERTA, OrderStatus.CUENTA_PEDIDA] } },
  { status: OrderStatus.PAGADA, type: { not: OrderType.MESA } },
];

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
  /**
   * Cómo se pidió: "Carne", "Bien asado". Van acá y no dentro de `notes` porque
   * la cocina tiene que poder leerlos de un vistazo y sin ambigüedad —una nota
   * es texto que alguien escribió, esto es lo que se eligió de la carta.
   */
  modificadores: string[];
  /**
   * Quién lo tomó. El id es para saber si el botón de "Listo" es tuyo; el nombre,
   * para que el que no lo tomó sepa a quién ir a buscar en vez de leer "no podés".
   */
  tomadoPorId: string | null;
  tomadoPor: string | null;
  /** Milisegundos, para el cronómetro del renglón. `null` mientras nadie lo tomó. */
  desdeQueLoTomaron: number | null;
};

export type ComandaOrden = {
  id: string;
  orderId: string;
  code: number;
  mesa: string | null;
  /**
   * De quién es esta cuenta: "Andrés", "Cuenta 2". Una mesa puede tener varias
   * cuentas abiertas a la vez, y cada una llega acá como su propia comanda. Sin
   * el nombre, a la cocina le llegan tres tarjetas idénticas que dicen "Mesa 12"
   * y no hay forma de saber a quién servirle qué.
   */
  cuenta: string | null;
  turno: number | null;
  type: string;
  notes: string | null;
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
      ...RENGLON_EN_COCINA,
      order: {
        businessDate,
        OR: PEDIDO_QUE_LE_IMPORTA_A_COCINA,
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
      startedAt: true,
      startedById: true,
      startedBy: { select: { name: true } },
      modifiers: {
        orderBy: { sortOrder: "asc" },
        select: { optionNameSnapshot: true },
      },
      product: { select: { kitchenStation: true, preparationMinutes: true } },
      order: {
        select: {
          id: true,
          code: true,
          type: true,
          turnNumber: true,
          notes: true,
          customerName: true,
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
        cuenta: item.order.customerName,
        turno: item.order.turnNumber,
        type: item.order.type,
        notes: item.order.notes,
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
      modificadores: item.modifiers.map((m) => m.optionNameSnapshot),
      tomadoPorId: item.startedById,
      tomadoPor: item.startedBy?.name ?? null,
      desdeQueLoTomaron: item.startedAt?.getTime() ?? null,
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

/**
 * Cuántas comandas tiene la cocina en la mano ahora mismo.
 *
 * Cuenta **pedidos, no renglones ni tarjetas**: `getComandas` parte cada pedido
 * en una comanda por estación, así que un pedido con una hamburguesa y una
 * limonada aparece dos veces en la pantalla. La insignia del menú tiene que
 * decir cuántos pedidos faltan, no cuántas tarjetas hay.
 */
export async function contarComandasVivas(
  businessId: string,
  businessDate: Date,
): Promise<number> {
  return tenantDb(businessId).order.count({
    where: {
      businessDate,
      OR: PEDIDO_QUE_LE_IMPORTA_A_COCINA,
      items: { some: RENGLON_EN_COCINA },
    },
  });
}

export type ItemPreparacion = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  notes: string | null;
  status: string;
  sentToKitchenAt: Date | null;
  createdAt: Date;
  estacion: string;
  orderId: string;
  code: number;
  mesa: string | null;
  cuenta: string | null;
  turno: number | null;
  type: string;
  modificadores: string[];
};

export async function getPreparacionesActivas(
  businessId: string,
  businessDate: Date,
): Promise<ItemPreparacion[]> {
  const items = await tenantDb(businessId).orderItem.findMany({
    where: {
      ...RENGLON_EN_COCINA,
      order: {
        businessDate,
        OR: PEDIDO_QUE_LE_IMPORTA_A_COCINA,
      },
    },
    orderBy: { sentToKitchenAt: "asc" },
    select: {
      id: true,
      nameSnapshot: true,
      quantity: true,
      notes: true,
      status: true,
      createdAt: true,
      sentToKitchenAt: true,
      modifiers: {
        orderBy: { sortOrder: "asc" },
        select: { optionNameSnapshot: true },
      },
      product: { select: { kitchenStation: true } },
      order: {
        select: {
          id: true,
          code: true,
          type: true,
          turnNumber: true,
          customerName: true,
          table: { select: { name: true } },
        },
      },
    },
  });

  return items.map((i) => ({
    id: i.id,
    nameSnapshot: i.nameSnapshot,
    quantity: i.quantity,
    notes: i.notes,
    status: i.status,
    sentToKitchenAt: i.sentToKitchenAt,
    createdAt: i.createdAt,
    estacion: i.product.kitchenStation?.trim() || "Sin estación",
    orderId: i.order.id,
    code: i.order.code,
    mesa: i.order.table?.name ?? null,
    cuenta: i.order.customerName,
    turno: i.order.turnNumber,
    type: i.order.type,
    modificadores: i.modifiers.map((m) => m.optionNameSnapshot),
  }));
}
