import { z } from "zod";
import { CashMovementType } from "@/generated/prisma/enums";
import { montoCop, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

export const abrirCajaSchema = z.object({
  /** La base con la que arranca el turno: lo que hay en el cajón para dar vuelto. */
  openingFloatCop: montoCopPositivo,
});

export const cerrarCajaSchema = z.object({
  /** Lo que la persona contó de verdad. La diferencia contra lo esperado se guarda. */
  countedCashCop: montoCopPositivo,
  notes: textoOpcional(500),
});

export const movimientoSchema = z.object({
  type: z.enum(CashMovementType),
  // El ajuste puede ser negativo (faltante); el resto son magnitudes positivas y
  // el signo lo pone el tipo de movimiento.
  amountCop: montoCop,
  concept: z
    .string()
    .trim()
    .min(3, "Escribí para qué fue.")
    .max(200, "El concepto es demasiado largo."),
});
