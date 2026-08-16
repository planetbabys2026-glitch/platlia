import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { env } from "@/lib/env";
import { ErrorDeUsuario } from "@/lib/actions/estado";

/**
 * Cobro automático: la suscripción recurrente de MercadoPago (`preapproval`).
 *
 * Se cobra con otra API de MercadoPago —no Checkout Pro— que guarda el permiso de
 * débito y cobra solo cada mes o cada año. Nunca vemos ni guardamos los datos de
 * la tarjeta.
 *
 * Lo que llega por webhook son dos avisos nuevos: `subscription_preapproval`
 * cuando la autorización cambia de estado, y `subscription_authorized_payment`
 * cada vez que se cobra.
 */

function cliente(paraQue: string) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN || env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new ErrorDeUsuario(`Falta la variable MERCADOPAGO_ACCESS_TOKEN en el entorno, necesaria para ${paraQue}.`);
  }
  return new MercadoPagoConfig({
    accessToken: token,
    options: { timeout: 10_000 },
  });
}

function parsearErrorMercadoPago(err: unknown, accion: string): never {
  const errorObj = err as { status?: number; message?: string; code?: string };
  const mensajeStr = typeof errorObj?.message === "string" ? errorObj.message : "";
  const codeStr = typeof errorObj?.code === "string" ? errorObj.code : "";

  if (
    errorObj?.status === 403 ||
    errorObj?.status === 401 ||
    codeStr === "unauthorized" ||
    codeStr === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" ||
    mensajeStr.toLowerCase().includes("unauthorized") ||
    mensajeStr.toLowerCase().includes("authorization value not present")
  ) {
    throw new ErrorDeUsuario(
      "Credenciales de Mercado Pago inválidas o no autorizadas. La variable MERCADOPAGO_ACCESS_TOKEN en tu .env tiene formato de Public Key (~41 caracteres). Debe ser el Access Token de prueba completo (de ~75 a 80 caracteres comenzando con TEST-).",
    );
  }
  const msg = err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : String(err);
  throw new ErrorDeUsuario(`No se pudo ${accion} con Mercado Pago: ${msg}`);
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

  const buyerEmail = process.env.MP_BUYER_EMAIL;
  const payerEmail = buyerEmail || args.correoDelPagador;

  try {
    const respuesta = await new PreApproval(config).create({
      body: {
        reason: `Platlia · ${args.nombreNegocio}`,
        // La misma referencia que usa Checkout Pro: es lo que permite que el pago
        // recurrente encuentre su suscripción cuando vuelve por el webhook.
        external_reference: args.subscriptionId,
        payer_email: payerEmail,
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
      throw new ErrorDeUsuario("MercadoPago no devolvió un enlace para autorizar el cobro automático.");
    }

    return { id: respuesta.id, urlDeAutorizacion: url };
  } catch (err) {
    if (err instanceof ErrorDeUsuario) throw err;
    parsearErrorMercadoPago(err, "crear la autorización de cobro automático");
  }
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
