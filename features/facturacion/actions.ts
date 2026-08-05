"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { crearPreferenciaDePago } from "@/lib/billing/mercadopago";

/**
 * Iniciar el pago de la suscripción.
 *
 * `permitirSinLicencia` es lo único que importa acá: si esta acción exigiera
 * licencia vigente, un negocio vencido no podría pagar para dejar de estarlo.
 */
export const pagarSuscripcion = defineAction({
  schema: z.object({}),
  roles: [Role.ADMINISTRADOR],
  permitirSinLicencia: true,
  async handler({ ctx, db }) {
    const suscripcion = await db.subscription.findFirst({
      select: { id: true, priceCop: true, status: true },
    });
    if (!suscripcion) {
      throw new ErrorDeUsuario(
        "Este negocio no tiene una suscripción. Escribinos y la creamos.",
      );
    }
    if (suscripcion.status === "CANCELADA") {
      throw new ErrorDeUsuario(
        "La suscripción está cancelada. Escribinos para reactivarla.",
      );
    }

    const preferencia = await crearPreferenciaDePago({
      businessId: ctx.business.id,
      subscriptionId: suscripcion.id,
      nombreNegocio: ctx.business.name,
      precioCop: suscripcion.priceCop,
    });

    // Se sale del sitio: el pago ocurre en MercadoPago y nunca vemos una tarjeta.
    redirect(preferencia.urlDePago);
  },
});
