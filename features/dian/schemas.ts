import { z } from "zod";

/**
 * Los esquemas van aparte del archivo de acciones: en un archivo `"use server"`
 * toda función a nivel de módulo se compila como Server Action y el build falla
 * con "Server Actions must be async functions", sin mencionar a zod por ningún
 * lado.
 */

export const emitirFacturaSchema = z.object({
  orderId: z.string().min(1),
});

export const emitirNotaCreditoSchema = z.object({
  orderId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(5, "Escribí por qué se anula: queda en la nota crédito ante la DIAN.")
    .max(250),
});
