import "server-only";
import { OrderItemStatus } from "@/generated/prisma/enums";
import type { TenantDb } from "@/lib/db/tenant";

type Db = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

/**
 * Cuando el domicilio sale a la calle, la comanda se cierra en la cocina.
 *
 * El KDS muestra todo renglón que esté `PENDIENTE`, `EN_PREPARACION` o `LISTO`, y
 * quien lo pasa a `ENTREGADO` es la cocina al dárselo al mesero. En un domicilio
 * no hay mesero: la comida se la lleva el repartidor, y ese momento es el
 * despacho. Sin esto, cada pedido despachado se quedaba en la pantalla de cocina
 * para siempre y la insignia del menú contaba comandas que ya estaban en la moto.
 *
 * Solo toca lo que la cocina dio por listo. Si algo quedó a medio preparar, sigue
 * en la pantalla: que el pedido se haya cobrado no lo cocina.
 */
export async function cerrarComandaAlDespachar(db: Db, orderId: string): Promise<number> {
  const { count } = await db.orderItem.updateMany({
    where: {
      orderId,
      sentToKitchenAt: { not: null },
      status: OrderItemStatus.LISTO,
    },
    data: { status: OrderItemStatus.ENTREGADO, deliveredAt: new Date() },
  });

  return count;
}
