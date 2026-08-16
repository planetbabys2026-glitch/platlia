import { z } from "zod";

const qrClienteItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  notes: z.string().trim().optional(),
  /** Las opciones que el cliente eligió en el modal del menú. */
  modifierOptionIds: z.array(z.string()).max(50).default([]),
});

export const crearPedidoClienteQRSchema = z
  .object({
    businessSlug: z.string().trim().min(1),
    type: z.enum(["MESA", "DOMICILIO"]),
    tableId: z.string().trim().optional(),
    tableName: z.string().trim().optional(),
    customerName: z.string().trim().max(120).optional(),
    customerPhone: z.string().trim().optional(),
    customerAddress: z.string().trim().optional(),
    docType: z.string().trim().optional(),
    docNumber: z.string().trim().optional(),
    items: z.array(qrClienteItemSchema).min(1, "Elegí al menos un producto para enviar tu pedido."),
  })
  /**
   * En la mesa el nombre es obligatorio, y no por burocracia: cada escaneo abre
   * una cuenta propia, así que en una mesa de seis pueden convivir seis pedidos.
   * Sin nombre, a la cocina le llegan seis comandas idénticas de "Mesa 12" y no
   * hay forma de saber cuál plato es de quién al momento de servir.
   */
  .refine((v) => v.type !== "MESA" || Boolean(v.customerName?.trim()), {
    error: "Escribí tu nombre para que sepamos de quién es el pedido.",
    path: ["customerName"],
  });

export type CrearPedidoClienteQRInput = z.infer<typeof crearPedidoClienteQRSchema>;
