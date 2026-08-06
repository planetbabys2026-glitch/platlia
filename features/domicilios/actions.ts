"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import { actualizarEstadoDomicilioSchema } from "@/features/domicilios/schemas";
import { defineAction } from "@/lib/actions/define-action";
import { publishDomiciliosUpdate } from "@/lib/redis";

export const actualizarEstadoDomicilio = defineAction({
  schema: actualizarEstadoDomicilioSchema,
  roles: [Role.PROPIETARIO, Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO],
  async handler({ input, ctx, db }) {
    const dataToUpdate: Record<string, unknown> = {
      deliveryStatus: input.deliveryStatus,
    };

    if (input.deliveryStatus === "CANCELADO") {
      dataToUpdate.status = "ANULADA";
    }

    await db.order.update({
      where: { id: input.orderId },
      data: dataToUpdate,
    });

    void publishDomiciliosUpdate(ctx.business.id);

    revalidatePath("/domicilios");
    revalidatePath("/caja");
    revalidatePath("/pos");
  },
});
