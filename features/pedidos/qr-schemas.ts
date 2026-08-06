import { z } from "zod";

const qrClienteItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  notes: z.string().trim().optional(),
});

export const crearPedidoClienteQRSchema = z.object({
  businessSlug: z.string().trim().min(1),
  type: z.enum(["MESA", "DOMICILIO"]),
  tableId: z.string().trim().optional(),
  tableName: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  customerAddress: z.string().trim().optional(),
  docType: z.string().trim().optional(),
  docNumber: z.string().trim().optional(),
  items: z.array(qrClienteItemSchema).min(1, "Elegí al menos un producto para enviar tu pedido."),
});

export type CrearPedidoClienteQRInput = z.infer<typeof crearPedidoClienteQRSchema>;
