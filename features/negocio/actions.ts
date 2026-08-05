"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import { datosNegocioSchema, operacionSchema } from "@/features/negocio/schemas";
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
