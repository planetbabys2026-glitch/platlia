import { z } from "zod";
import { id, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * Carta: categorías, productos y presentaciones.
 *
 * El precio se escribe como lo escribe una persona ("18.900", "$18.900") y llega
 * como entero en pesos. Nada de decimales en ninguna parte.
 */

const nombre = z
  .string()
  .trim()
  .min(2, "El nombre necesita al menos 2 caracteres.")
  .max(120, "El nombre es demasiado largo.");

export const categoriaSchema = z.object({
  id: id.optional(),
  name: nombre,
  sortOrder: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : Number(v)),
    z.number().int().min(0).max(999).default(0),
  ),
});

export const productoSchema = z.object({
  id: id.optional(),
  categoryId: id,
  name: nombre,
  description: textoOpcional(500),
  sku: textoOpcional(40),
  priceCop: montoCopPositivo,
  /** Vacío = la tarifa por defecto de la empresa. */
  taxRateId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
  kitchenStation: textoOpcional(40),
  preparationMinutes: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().int().min(0).max(600).optional(),
  ),
  sortOrder: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : Number(v)),
    z.number().int().min(0).max(999).default(0),
  ),
});

export const presentacionSchema = z.object({
  id: id.optional(),
  productId: id,
  name: nombre,
  priceCop: montoCopPositivo,
});

/** Se acabó por hoy / volvió a haber. No toca el catálogo. */
export const disponibilidadSchema = z.object({
  productId: id,
  isAvailable: z.preprocess((v) => v === "true" || v === true, z.boolean()),
});

export const archivarSchema = z.object({ id });
