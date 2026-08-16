import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { env, requireEnv } from "@/lib/env";

/**
 * Cobro automático: la suscripción recurrente de MercadoPago (`preapproval`).
 *
 * Es otra API que Checkout Pro. En vez de crear una preferencia por cada pago, se
 * crea una autorización de débito: el cliente la aprueba una vez y MercadoPago
 * cobra solo cada mes o cada año. Nosotros nunca vemos la tarjeta, igual que antes.
 *
 * Lo que llega por webhook son dos avisos nuevos: `subscription_preapproval`
 * cuando la autorización cambia de estado, y `subscription_authorized_payment`
 * cada vez que se cobra.
 */

function cliente(paraQue: string) {
  return new MercadoPagoConfig({
    accessToken: requireEnv("MP_ACCESS_TOKEN", paraQue),
    options: { timeout: 10_000 },
  });
}

export type Frecuencia = "MENSUAL" | "ANUAL";

/** Cada cuánto cobra MercadoPago, en el vocabulario de su API. */
const RECURRENCIA: Record<Frecuencia, { frequency: number; frequency_type: string }> = {
  MENSUAL: { frequency: 1, frequency_type: "months" },
  ANUAL: { frequency: 12, frequency_type: "months" },
};

export type AutorizacionCreada = {
  id: string;
  /** A dónde mandar al cliente para que autorice el débito. */
  urlDeAutorizacion: string;
};

export async function crearAutorizacionDeCobro(args: {
  subscriptionId: string;
  nombreNegocio: string;
  correoDelPagador: string;
  montoCop: number;
  frecuencia: Frecuencia;
  /**
   * Cuándo hacer el primer cobro. Se manda el fin del período ya pagado: quien
   * enciende el débito faltándole veinte días no puede pagar dos veces por los
   * mismos veinte días.
   */
  primerCobro: Date;
}): Promise<AutorizacionCreada> {
  const config = cliente("activar el cobro automático");
  const volverA = env.MP_BACK_URL ?? `${env.APP_URL}/facturacion`;

  const respuesta = await new PreApproval(config).create({
    body: {
      reason: `Platlia · ${args.nombreNegocio}`,
      // La misma referencia que usa Checkout Pro: es lo que permite que el pago
      // recurrente encuentre su suscripción cuando vuelve por el webhook.
      external_reference: args.subscriptionId,
      payer_email: args.correoDelPagador,
      back_url: volverA,
      auto_recurring: {
        ...RECURRENCIA[args.frecuencia],
        transaction_amount: args.montoCop,
        currency_id: "COP",
        // La API la quiere en ISO. Si la fecha ya pasó, MercadoPago cobra al
        // autorizar, que es lo correcto para una licencia vencida.
        start_date: args.primerCobro.toISOString(),
      },
      status: "pending",
    },
  });

  const url = respuesta.init_point;
  if (!respuesta.id || !url) {
    throw new Error("MercadoPago no devolvió un enlace para autorizar el cobro automático.");
  }

  return { id: respuesta.id, urlDeAutorizacion: url };
}

export type EstadoAutorizacion = {
  id: string;
  /** `pending`, `authorized`, `paused` o `cancelled`. */
  status: string;
  subscriptionId: string | null;
  payerId: string | null;
  montoCop: number | null;
};

export async function consultarAutorizacion(preapprovalId: string): Promise<EstadoAutorizacion> {
  const config = cliente("consultar el cobro automático");
  const r = await new PreApproval(config).get({ id: preapprovalId });

  return {
    id: String(r.id),
    status: r.status ?? "unknown",
    subscriptionId: r.external_reference ?? null,
    payerId: r.payer_id ? String(r.payer_id) : null,
    montoCop: r.auto_recurring?.transaction_amount ?? null,
  };
}

/**
 * Cancela el débito automático.
 *
 * Cancelar el cobro **no** apaga la licencia: lo que ya se pagó se usa hasta el
 * final. Cortar el servicio en el momento sería cobrarle a alguien por días que
 * después no le damos, y es lo que hace que la gente tenga miedo de darle a
 * cancelar.
 */
export async function cancelarAutorizacion(preapprovalId: string): Promise<void> {
  const config = cliente("cancelar el cobro automático");
  await new PreApproval(config).update({
    id: preapprovalId,
    body: { status: "cancelled" },
  });
}
