import { z } from "zod";

export const actualizarEstadoDomicilioSchema = z.object({
  orderId: z.string().min(1, "El pedido es requerido."),
  deliveryStatus: z.enum(["PENDIENTE", "EN_PREPARACION", "EN_CAMINO", "ENTREGADO", "CANCELADO"]),
});
