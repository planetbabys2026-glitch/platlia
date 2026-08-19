"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppModule, DeliveryStatus, OrderItemStatus, Role } from "@/generated/prisma/enums";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import {
  publishCocinaUpdate,
  publishDomiciliosUpdate,
  publishTurneroUpdate,
} from "@/lib/redis";
import { id } from "@/lib/validaciones";

/**
 * La cocina mueve el renglón por sus estados: pendiente → en preparación → listo
 * → entregado.
 *
 * No se salta hacia atrás ni se brinca a entregado desde pendiente: los tiempos
 * que después se miran en los informes —cuánto tardó en salir un plato— solo
 * significan algo si las marcas se pusieron en orden.
 */

const SIGUIENTE: Record<string, string> = {
  PENDIENTE: OrderItemStatus.EN_PREPARACION,
  EN_PREPARACION: OrderItemStatus.LISTO,
  LISTO: OrderItemStatus.ENTREGADO,
};

const MARCA_DE_TIEMPO: Record<string, "readyAt" | "deliveredAt" | null> = {
  EN_PREPARACION: null,
  LISTO: "readyAt",
  ENTREGADO: "deliveredAt",
};

export const avanzarComanda = defineAction({
  schema: z.object({ itemId: id }),
  roles: [Role.COCINA, Role.MESERO, Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.COCINA,
  async handler({ input, db, ctx }) {
    const item = await db.orderItem.findFirst({
      where: { id: input.itemId },
      select: {
        id: true,
        status: true,
        orderId: true,
        nameSnapshot: true,
        order: { select: { deliveryStatus: true } },
      },
    });
    if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");

    const siguiente = SIGUIENTE[item.status];
    if (!siguiente) {
      throw new ErrorDeUsuario(
        item.status === "ANULADO"
          ? "Ese renglón está anulado."
          : `${item.nameSnapshot} ya fue entregado.`,
      );
    }

    const marca = MARCA_DE_TIEMPO[siguiente];
    await db.orderItem.update({
      where: { id: item.id },
      data: {
        status: siguiente as OrderItemStatus,
        ...(marca ? { [marca]: new Date() } : {}),
      },
    });

    /**
     * Cuando la cocina termina, el domicilio sale de la cocina y entra a la caja.
     *
     * Esta acción trabaja por RENGLÓN y nunca tocaba el pedido, así que un
     * domicilio se quedaba en "En cocina" para siempre por más que estuviera
     * empacado. La caja, mientras tanto, lo listaba desde que nacía.
     *
     * El disparador es que no quede ningún renglón por preparar: el pedido está
     * completo, no a medias.
     */
    let despachable = false;
    if (item.order?.deliveryStatus === DeliveryStatus.EN_PREPARACION) {
      const enPreparacion = await db.orderItem.count({
        where: {
          orderId: item.orderId,
          sentToKitchenAt: { not: null },
          status: { in: [OrderItemStatus.PENDIENTE, OrderItemStatus.EN_PREPARACION] },
        },
      });

      if (enPreparacion === 0) {
        await db.order.update({
          where: { id: item.orderId },
          data: { deliveryStatus: DeliveryStatus.LISTO },
        });
        despachable = true;
      }
    }

    revalidatePath("/cocina");
    revalidatePath("/turnero");
    revalidatePath(`/pedido/${item.orderId}`);

    void publishCocinaUpdate(ctx.business.id);
    void publishTurneroUpdate(ctx.business.id);

    if (despachable) {
      revalidatePath("/domicilios");
      revalidatePath("/caja");
      void publishDomiciliosUpdate(ctx.business.id);
    }

    return { status: siguiente, despachable };
  },
});
