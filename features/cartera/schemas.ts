import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { id, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * Un abono a la deuda de una persona.
 *
 * El método es con qué pagó AHORA —efectivo, transferencia—, no cómo se fió. No
 * se admite `CREDITO`: no se paga una deuda con otra deuda. `BONO` y `OTRO`
 * tampoco, porque no representan plata que entre a un saldo y el arqueo no
 * sabría dónde ponerlos.
 */
export const abonoSchema = z.object({
  deudorId: id,
  montoCop: montoCopPositivo.refine((v) => v > 0, "El abono tiene que ser mayor a cero."),
  method: z.enum(PaymentMethod).refine(
    (m) => m !== PaymentMethod.CREDITO && m !== PaymentMethod.BONO && m !== PaymentMethod.OTRO,
    "Elegí con qué pagó: no se abona una deuda con otra deuda.",
  ),
  nota: textoOpcional(200),
});

/**
 * Perdonar lo que no se va a cobrar.
 *
 * Existe porque un pedido `PAGADA` no se puede anular —`anularPedido` lo rechaza—
 * así que sin esto un fiado incobrable se queda en la cartera para siempre,
 * inflando lo que el negocio cree que le deben. Exige motivo escrito: es plata
 * que el negocio decide perder.
 */
export const condonarSchema = z.object({
  fiadoId: id,
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se perdona esta deuda.")
    .max(200, "El motivo es demasiado largo."),
});

/** Consulta de cuánto debe un teléfono, para decirlo antes de fiar. */
export const consultaDeDeudaSchema = z.object({
  telefono: z.string().trim().min(7).max(30),
});

/** La ficha de una persona, que la pantalla pide al elegirla en la lista. */
export const fichaSchema = z.object({ deudorId: id });
