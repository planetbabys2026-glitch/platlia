import { z } from "zod";

export const solicitarSedeAdicionalSchema = z.object({
  cantidadSedes: z.preprocess((v) => Number(v) || 2, z.number().int().min(2)),
  periodoMeses: z.preprocess((v) => Number(v) || 1, z.number().int().min(1)),
  observaciones: z.string().trim().optional(),
});

/**
 * Lo único que elige el cliente es cuánto tiempo compra.
 *
 * El precio NO viaja en el formulario: se calcula en el servidor con la lista
 * vigente. Una Server Action es un POST alcanzable con curl, así que un monto
 * mandado por el cliente sería un monto elegido por el cliente.
 */
export const pagarSuscripcionSchema = z.object({
  periodicidad: z.enum(["MENSUAL", "SEMESTRAL", "ANUAL"]).default("MENSUAL"),
});

/** Cada cuánto quiere que le cobren solo. */
export const activarCobroAutomaticoSchema = z.object({
  frecuencia: z.enum(["MENSUAL", "ANUAL"]).default("MENSUAL"),
});
