import { z } from "zod";
import { montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * Los valores viven en el enum `DeliveryStatus` de Prisma y en
 * `features/domicilios/reglas.ts`. Antes estaban copiados a mano acá, en la
 * pantalla y en las consultas: tres listas que podían divergir sin que nada
 * fallara.
 */
export const estadoDomicilio = z.enum([
  "POR_CONFIRMAR",
  "EN_PREPARACION",
  "LISTO",
  "EN_CAMINO",
  "ENTREGADO",
  "CANCELADO",
]);

export const actualizarEstadoDomicilioSchema = z.object({
  orderId: z.string().min(1, "El pedido es requerido."),
  deliveryStatus: estadoDomicilio,
});

/**
 * Confirmar es más que mover un estado: es dar por buenos los datos que escribió
 * el comensal antes de que la cocina se ponga a trabajar.
 *
 * La dirección y el teléfono llegan del menú QR sin que nadie los revise, y el
 * costo de envío es una tarifa fija del negocio que en una dirección lejana no
 * alcanza. Los tres se pueden corregir acá, que es el único momento en que
 * todavía no cuesta nada.
 */
export const confirmarDomicilioSchema = z.object({
  orderId: z.string().min(1, "El pedido es requerido."),
  deliveryAddress: z
    .string()
    .trim()
    .min(6, "Escribí la dirección de entrega.")
    .max(300),
  customerPhone: textoOpcional(40),
  deliveryFeeCop: montoCopPositivo,
});

/** Anular un domicilio exige decir por qué, igual que anular cualquier venta. */
export const anularDomicilioSchema = z.object({
  orderId: z.string().min(1, "El pedido es requerido."),
  motivo: z.string().trim().min(3, "Escribí el motivo de la anulación.").max(200),
});

/**
 * El interruptor con el que el cajero abre y cierra los domicilios por QR.
 *
 * Un booleano explícito y no un "alternar": si dos personas lo tocan a la vez
 * —el cajero en la caja y el de domicilios en su pantalla— un alternar deja el
 * estado al azar, y acá el azar significa un local que cree estar cerrado
 * recibiendo pedidos.
 */
export const abrirDomiciliosQrSchema = z.object({
  abierto: z.boolean(),
});
