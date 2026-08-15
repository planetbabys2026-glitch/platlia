import { z } from "zod";
import { id, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * Biblioteca de modificadores de la empresa.
 *
 * Los esquemas viven acá y no en `actions.ts` porque en un archivo `"use server"`
 * toda función a nivel de módulo se compila como Server Action, y el build falla
 * con "Server Actions must be async functions" sin mencionar a zod por ningún
 * lado.
 */

const nombre = z
  .string()
  .trim()
  .min(2, "El nombre necesita al menos 2 caracteres.")
  .max(80, "El nombre es demasiado largo.");

const entero = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("Tiene que ser un número entero.").min(0).max(max),
  );

export const grupoSchema = z
  .object({
    id: id.optional(),
    name: nombre,
    helpText: textoOpcional(160),
    minSelect: entero(20),
    maxSelect: entero(20),
    sortOrder: entero(999),
  })
  .refine((v) => v.maxSelect >= 1, {
    error: "Se tiene que poder elegir al menos una opción.",
    path: ["maxSelect"],
  })
  .refine((v) => v.minSelect <= v.maxSelect, {
    error: "El mínimo no puede ser mayor que el máximo.",
    path: ["minSelect"],
  });

export const opcionSchema = z.object({
  id: id.optional(),
  groupId: id,
  name: nombre,
  /** Recargo sobre el precio del renglón. Cero es lo normal. */
  priceDeltaCop: montoCopPositivo,
  isDefault: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  sortOrder: entero(999),
});

/**
 * Los insumos de una opción viajan como JSON en un solo campo, igual que la
 * receta de un producto (`guardarRecetaSchema`): son una lista de largo variable
 * que el navegador arma en estado de React.
 */
export const insumosDeOpcionSchema = z.object({
  optionId: id,
  itemsJson: z.string().min(2, "Mandá la lista de insumos."),
});

/** La forma de cada renglón dentro de `itemsJson`, ya parseado. */
export const insumoDeOpcionSchema = z.object({
  inventoryItemId: z.string().min(1, "Elegí el insumo."),
  quantityRequired: z
    .number()
    .int("La cantidad va en unidades enteras.")
    .min(1, "La cantidad requerida debe ser mayor a 0."),
});

export const archivarModificadorSchema = z.object({ id });
