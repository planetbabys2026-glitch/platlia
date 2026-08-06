import { z } from "zod";
import { id, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * Carta: categorías y productos.
 *
 * No hay presentaciones: "Cerveza (Botella)" y "Cerveza (Litro)" son dos
 * productos, no un producto con dos precios. Mezclarlos en una sola entidad
 * era justo lo que generaba errores al vender y una carta de administración
 * más confusa de lo que hacía falta.
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
  // La llena el widget de subida (subirImagenProducto) con la URL que devuelve
  // Cloudinary. El producto en sí no sabe de dónde salió: solo guarda el string.
  imageUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.url("Pegá una URL de imagen válida.").max(500).optional(),
  ),
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

export const subirImagenSchema = z.object({
  file: z
    .instanceof(File, { error: "Elegí una imagen." })
    .refine((f) => f.size > 0, "Elegí una imagen.")
    .refine((f) => f.type.startsWith("image/"), "Eso no es una imagen.")
    // El límite real de la Server Action es más generoso; este es el corte de
    // sentido común para lo que llega ya comprimido desde el navegador.
    .refine((f) => f.size <= 8 * 1024 * 1024, "La imagen pesa demasiado (máximo 8 MB)."),
});

/** Se acabó por hoy / volvió a haber. No toca el catálogo. */
export const disponibilidadSchema = z.object({
  productId: id,
  isAvailable: z.preprocess((v) => v === "true" || v === true, z.boolean()),
});

export const archivarSchema = z.object({ id });
