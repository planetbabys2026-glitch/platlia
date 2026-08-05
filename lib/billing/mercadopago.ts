import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { env, requireEnv } from "@/lib/env";

/**
 * Cliente de MercadoPago.
 *
 * Se cobra con Checkout Pro: se crea una preferencia, el cliente paga en el sitio
 * de MercadoPago y vuelve. No se toca ni se guarda un dato de tarjeta en ningún
 * momento, que es exactamente la razón de usarlo.
 *
 * Todo se construye bajo demanda: un Platlia sin MercadoPago configurado tiene
 * que arrancar igual y funcionar entero salvo el cobro de la suscripción. El día
 * que alguien toque "pagar" sin credenciales, `requireEnv` dice qué falta.
 */

function cliente(paraQue: string) {
  return new MercadoPagoConfig({
    accessToken: requireEnv("MP_ACCESS_TOKEN", paraQue),
    options: { timeout: 10_000 },
  });
}

export type PreferenciaCreada = {
  id: string;
  /** A dónde mandar al usuario para que pague. */
  urlDePago: string;
};

export async function crearPreferenciaDePago(args: {
  businessId: string;
  subscriptionId: string;
  nombreNegocio: string;
  precioCop: number;
}): Promise<PreferenciaCreada> {
  const config = cliente("cobrar la suscripción");
  const volverA = env.MP_BACK_URL ?? `${env.APP_URL}/facturacion`;

  const preferencia = await new Preference(config).create({
    body: {
      items: [
        {
          id: args.subscriptionId,
          title: `Platlia · ${args.nombreNegocio}`,
          description: "Suscripción mensual",
          quantity: 1,
          currency_id: "COP",
          unit_price: args.precioCop,
        },
      ],
      // Con qué se relaciona el pago cuando vuelva por el webhook. Se manda por
      // los dos caminos porque MercadoPago no garantiza `metadata` en todos los
      // eventos, y sin esto un pago aprobado no se sabe de quién es.
      external_reference: args.subscriptionId,
      metadata: {
        business_id: args.businessId,
        subscription_id: args.subscriptionId,
      },
      back_urls: {
        success: volverA,
        failure: volverA,
        pending: volverA,
      },
      auto_return: "approved",
      notification_url: `${env.APP_URL}/api/webhooks/mercadopago`,
      statement_descriptor: "PLATLIA",
    },
  });

  const urlDePago =
    env.NODE_ENV === "production" ? preferencia.init_point : preferencia.sandbox_init_point;

  if (!preferencia.id || !urlDePago) {
    throw new Error("MercadoPago no devolvió un enlace de pago utilizable.");
  }

  return { id: preferencia.id, urlDePago };
}

export type PagoDeMercadoPago = {
  id: string;
  status: string;
  statusDetail: string | null;
  amountCop: number;
  method: string | null;
  externalReference: string | null;
  businessId: string | null;
  subscriptionId: string | null;
  aprobadoEn: Date | null;
};

/**
 * Consulta un pago por su id.
 *
 * El webhook solo trae el identificador: el estado se pregunta acá. Creerle el
 * estado a un cuerpo que llegó por HTTP sería confiar en el que avisa, y quien
 * avisa puede ser cualquiera.
 */
export async function consultarPago(mpPaymentId: string): Promise<PagoDeMercadoPago> {
  const config = cliente("verificar un pago de MercadoPago");
  const pago = await new Payment(config).get({ id: mpPaymentId });

  const metadata = (pago.metadata ?? {}) as Record<string, unknown>;
  const leer = (clave: string) => {
    const valor = metadata[clave];
    return typeof valor === "string" && valor ? valor : null;
  };

  return {
    id: String(pago.id),
    status: pago.status ?? "unknown",
    statusDetail: pago.status_detail ?? null,
    // En COP no hay centavos, pero la API devuelve number: se redondea al peso.
    amountCop: Math.round(pago.transaction_amount ?? 0),
    method: pago.payment_method_id ?? null,
    externalReference: pago.external_reference ?? null,
    businessId: leer("business_id"),
    subscriptionId: leer("subscription_id") ?? pago.external_reference ?? null,
    aprobadoEn: pago.date_approved ? new Date(pago.date_approved) : null,
  };
}

/** Traduce el estado de MercadoPago al del modelo. */
export function traducirEstado(estado: string): "PENDIENTE" | "APROBADO" | "RECHAZADO" | "REEMBOLSADO" | "CONTRACARGO" {
  switch (estado) {
    case "approved":
      return "APROBADO";
    case "refunded":
      return "REEMBOLSADO";
    case "charged_back":
      return "CONTRACARGO";
    case "rejected":
    case "cancelled":
      return "RECHAZADO";
    default:
      // in_process, pending, authorized: todavía no es plata en la cuenta.
      return "PENDIENTE";
  }
}
