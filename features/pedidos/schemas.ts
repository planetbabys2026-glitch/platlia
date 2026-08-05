import { z } from "zod";
import { OrderType, PaymentMethod } from "@/generated/prisma/enums";
import { cantidad, id, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

export const abrirPedidoSchema = z
  .object({
    type: z.enum(OrderType).default(OrderType.MESA),
    tableId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
    guestsCount: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().int().min(1).max(99).optional(),
    ),
    customerName: textoOpcional(120),
    customerPhone: textoOpcional(40),
    deliveryAddress: textoOpcional(300),
  })
  .refine((v) => v.type !== OrderType.MESA || Boolean(v.tableId), {
    error: "Elegí una mesa.",
    path: ["tableId"],
  })
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.deliveryAddress), {
    error: "Un domicilio necesita dirección.",
    path: ["deliveryAddress"],
  });

export const agregarItemSchema = z.object({
  orderId: id,
  productId: id,
  variantId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
  quantity: cantidad.default(1),
  notes: textoOpcional(200),
});

export const cambiarCantidadSchema = z.object({
  itemId: id,
  quantity: cantidad,
});

export const anularItemSchema = z.object({
  itemId: id,
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se anula.")
    .max(200, "El motivo es demasiado largo."),
});

export const pedidoSchema = z.object({ orderId: id });

export const anularPedidoSchema = z.object({
  orderId: id,
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se anula.")
    .max(200, "El motivo es demasiado largo."),
});

export const propinaSchema = z.object({
  orderId: id,
  tipCop: montoCopPositivo,
});

export const pagoSchema = z.object({
  orderId: id,
  method: z.enum(PaymentMethod),
  amountCop: montoCopPositivo.refine((v) => v > 0, "El pago tiene que ser mayor a cero."),
  /** Con cuánto pagó: solo aplica al efectivo y sirve para calcular el vuelto. */
  tenderedCop: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    montoCopPositivo.optional(),
  ),
  reference: textoOpcional(60),
});
