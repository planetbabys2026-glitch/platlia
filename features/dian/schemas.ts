import { z } from "zod";
import { TIPOS_DE_DOCUMENTO } from "@/lib/billing/factus-habilitacion";
import { correoOpcional, textoOpcional } from "@/lib/validaciones";

/**
 * Los esquemas van aparte del archivo de acciones: en un archivo `"use server"`
 * toda función a nivel de módulo se compila como Server Action y el build falla
 * con "Server Actions must be async functions", sin mencionar a zod por ningún
 * lado.
 */

/**
 * Emitir, corrigiendo los datos del cliente en el mismo gesto.
 *
 * Los cuatro campos son opcionales: sin ellos se factura con lo que ya tiene la
 * venta —a consumidor final si nunca se pidieron—, que es el caso normal en un
 * bar. Van acá y no en una acción aparte porque **corregir y emitir son un solo
 * acto**: guardarlos primero y emitir después deja el estado intermedio "datos
 * cambiados, factura no emitida", y nadie sabría si el documento salió con los
 * viejos o con los nuevos.
 *
 * Se piden en el momento de emitir, y no antes, porque es cuando alguien está
 * mirando: un NIT mal escrito es una factura rechazada por la DIAN que aparece
 * recién al emitir, con el cliente esperando en la caja.
 */
export const emitirFacturaSchema = z
  .object({
    orderId: z.string().min(1),
    customerName: textoOpcional(120),
    docType: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.enum(TIPOS_DE_DOCUMENTO.map((t) => t.valor)).optional(),
    ),
    docNumber: textoOpcional(20),
    customerEmail: correoOpcional,
  })
  .refine((v) => !v.docNumber?.trim() || Boolean(v.docType), {
    error: "Elegí si es cédula o NIT.",
    path: ["docType"],
  })
  .refine((v) => !v.docType || Boolean(v.docNumber?.trim()), {
    error: "Escribí el número del documento.",
    path: ["docNumber"],
  })
  .refine((v) => !v.docNumber?.trim() || Boolean(v.customerName?.trim()), {
    error: "Escribí a nombre de quién va la factura.",
    path: ["customerName"],
  });

export const emitirNotaCreditoSchema = z.object({
  orderId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(5, "Escribí por qué se anula: queda en la nota crédito ante la DIAN.")
    .max(250),
});
