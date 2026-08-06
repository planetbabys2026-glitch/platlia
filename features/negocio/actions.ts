"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import { datosNegocioSchema, modulosSchema, operacionSchema, turneroSchema } from "@/features/negocio/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { assertTimeZone } from "@/lib/time";

/**
 * Configuración del negocio.
 *
 * Solo el propietario y el administrador entran acá: cambiar la hora de corte o
 * si el precio incluye impuesto altera cómo se factura y cómo cuadra la caja.
 */

const ADMINISTRAN = [Role.ADMINISTRADOR] as const;

export const guardarDatosNegocio = defineAction({
  schema: datosNegocioSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    await db.business.update({
      where: { id: ctx.business.id },
      data: {
        name: input.name,
        legalName: input.legalName ?? null,
        taxId: input.taxId ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/panel");
  },
});

export const guardarOperacion = defineAction({
  schema: operacionSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    try {
      assertTimeZone(input.timeZone);
    } catch {
      throw new ErrorDeUsuario(`"${input.timeZone}" no es una zona horaria válida.`);
    }

    // Cambiar el corte de jornada con una caja abierta movería ventas ya cobradas
    // de un día a otro y el corte de esta noche dejaría de cuadrar.
    const cajaAbierta = await db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true },
    });
    const settings = await db.businessSettings.findFirstOrThrow({
      select: { businessDayStartMinutes: true, timeZone: true },
    });
    const cambiaLaJornada =
      settings.businessDayStartMinutes !== input.businessDayStart ||
      settings.timeZone !== input.timeZone;

    if (cajaAbierta && cambiaLaJornada) {
      throw new ErrorDeUsuario(
        "Hay una caja abierta. Cerrá el turno antes de cambiar la zona horaria o la hora de corte.",
      );
    }

    await db.businessSettings.updateMany({
      data: {
        timeZone: input.timeZone,
        businessDayStartMinutes: input.businessDayStart,
        pricesIncludeTax: input.pricesIncludeTax,
        tipSuggestionEnabled: input.tipSuggestionEnabled,
        tipSuggestionRateBp: input.tipSuggestionRate,
        cashRoundingCop: input.cashRoundingCop,
        requireOpenCashSession: input.requireOpenCashSession,
        turnNumberMax: input.turnNumberMax,
        receiptWidth: input.receiptWidth,
        receiptHeader: input.receiptHeader ?? null,
        receiptFooter: input.receiptFooter ?? null,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/panel");
    revalidatePath("/caja");
  },
});

/**
 * Prende o apaga mesas y domicilios.
 *
 * No todo negocio los usa —un local de mostrador no tiene mesas que sentar—, y
 * la interfaz se adapta: sin mesas, "Salón" desaparece del menú y la pantalla de
 * entrada pasa a ser /pos.
 */
export const guardarModulos = defineAction({
  schema: modulosSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    if (!input.mesasHabilitado) {
      // Apagar mesas con una mesa ocupada dejaría ese pedido sin ninguna
      // pantalla desde la cual seguir atendiéndolo: /salon desaparece del menú
      // y /pedido/[id] no se llega a él sin el enlace directo.
      const mesaAbierta = await db.order.findFirst({
        where: { type: "MESA", status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
        select: { id: true },
      });
      if (mesaAbierta) {
        throw new ErrorDeUsuario(
          "Hay una mesa con un pedido abierto. Cobralo o anulalo antes de apagar mesas.",
        );
      }
    }

    await db.businessModule.upsert({
      where: { businessId_module: { businessId: ctx.business.id, module: AppModule.MESAS } },
      update: { enabled: input.mesasHabilitado },
      create: {
        businessId: ctx.business.id,
        module: AppModule.MESAS,
        enabled: input.mesasHabilitado,
      },
    });

    await db.businessSettings.updateMany({
      data: { deliveryEnabled: input.deliveryEnabled },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/salon");
    revalidatePath("/pos");
    revalidatePath("/panel");
  },
});

export const guardarTurneroSettings = defineAction({
  schema: turneroSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: {
        turneroMediaMode: input.turneroMediaMode,
        turneroImages: input.turneroImages,
        turneroImageIntervalSeconds: input.turneroImageIntervalSeconds,
        turneroYoutubeUrl: input.turneroYoutubeUrl ?? null,
        turneroBadgePosition: input.turneroBadgePosition,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/turnero");
  },
});
