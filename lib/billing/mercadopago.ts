import { Invoice, MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { env } from "@/lib/env";
import { ErrorDeUsuario } from "@/lib/actions/estado";

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

export type PreferenciaCreada = {
  id: string;
  /** A dónde mandar al usuario para que pague. */
  urlDePago: string;
};

function resolverDatosComprador(args: { payerEmail?: string; payerName?: string }) {
  const buyerEmail = process.env.MP_BUYER_EMAIL;
  const email = buyerEmail || args.payerEmail;
  if (!email) return undefined;

  return {
    name: args.payerName || "Usuario",
    surname: "Platlia",
    email,
  };
}

export async function crearPreferenciaDePago(args: {
  businessId: string;
  subscriptionId: string;
  nombreNegocio: string;
  /** El TOTAL a cobrar de una vez, ya con el descuento aplicado. */
  precioCop: number;
  /** Meses de servicio que compra este pago. */
  meses: number;
  sedes: number;
  /** Cómo se le dice al plan en el resumen de MercadoPago. */
  detallePlan: string;
  /** Qué se está comprando. Por defecto, tiempo de licencia. */
  tipo?: "LICENCIA" | "SEDE_ADICIONAL";
  payerEmail?: string;
  payerName?: string;
}): Promise<PreferenciaCreada> {
  const config = cliente("cobrar la suscripción");
  const volverA = env.MP_BACK_URL ?? `${env.APP_URL}/facturacion`;
  const payer = resolverDatosComprador(args);

  try {
    const preferencia = await new Preference(config).create({
      body: {
        items: [
          {
            id: args.subscriptionId,
            title: `Platlia · ${args.nombreNegocio}`,
            description: args.detallePlan,
            // `quantity: 1` a propósito: el ítem es "el plan", no "un mes". Si los
            // meses fueran la cantidad, MercadoPago mostraría el precio unitario y
            // el cliente vería el mensual donde espera el total.
            quantity: 1,
            currency_id: "COP",
            unit_price: args.precioCop,
          },
        ],
        ...(payer ? { payer } : {}),
        // Con qué se relaciona el pago cuando vuelva por el webhook. Se manda por
        // los dos caminos porque MercadoPago no garantiza `metadata` en todos los
        // eventos, y sin esto un pago aprobado no se sabe de quién es.
        external_reference: args.subscriptionId,
        metadata: {
          business_id: args.businessId,
          subscription_id: args.subscriptionId,
          // Cuántos meses se compraron. Lo escribe el servidor al crear la
          // preferencia, así que el cliente no puede pedir doce y pagar uno.
          meses: args.meses,
          sedes: args.sedes,
          // Qué se compró. Un prorrateo de sede no suma tiempo de licencia: habilita
          // un cupo. Sin esto el webhook trataría los dos pagos igual.
          tipo: args.tipo ?? "LICENCIA",
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

    // Cuál de las dos URLs sirve lo decide la CREDENCIAL, no el NODE_ENV: con un
    // token de producción no existe sandbox_init_point, y elegir por entorno dejaba
    // el checkout sin enlace al probar en local con credenciales reales.
    const urlDePago = preferencia.init_point ?? preferencia.sandbox_init_point;

    if (!preferencia.id || !urlDePago) {
      throw new ErrorDeUsuario("MercadoPago no devolvió un enlace de pago utilizable.");
    }

    return { id: preferencia.id, urlDePago };
  } catch (err) {
    if (err instanceof ErrorDeUsuario) throw err;
    parsearErrorMercadoPago(err, "crear el portal de pago");
  }
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
  /** Meses comprados, según la metadata que escribió el servidor. */
  meses: number | null;
  sedes: number | null;
  /** "LICENCIA" (tiempo) o "SEDE_ADICIONAL" (cupo). */
  tipo: string | null;
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
  // MercadoPago devuelve los números de la metadata unas veces como number y
  // otras como string, según por dónde venga el evento. Se acepta cualquiera de
  // las dos y se descarta lo que no sea un entero positivo.
  const leerEntero = (clave: string) => {
    const valor = metadata[clave];
    const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
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
    meses: leerEntero("meses"),
    sedes: leerEntero("sedes"),
    tipo: leer("tipo"),
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

export type FacturaDeSuscripcion = {
  id: string;
  /** El pago real que generó este cobro recurrente. */
  paymentId: string | null;
  preapprovalId: string | null;
  status: string;
};

/**
 * Una "factura" del débito automático (`authorized_payment`).
 *
 * Es la pieza que une el aviso recurrente con un pago normal: MercadoPago avisa
 * con el id de la factura, no con el del pago, y sin este paso el webhook estaría
 * consultando un id que la API de pagos no conoce.
 */
export async function consultarFacturaDeSuscripcion(
  invoiceId: string,
): Promise<FacturaDeSuscripcion> {
  const config = cliente("verificar un cobro automático");
  const factura = await new Invoice(config).get({ id: invoiceId });

  return {
    id: String(factura.id ?? invoiceId),
    paymentId: factura.payment?.id ? String(factura.payment.id) : null,
    preapprovalId: factura.preapproval_id ?? null,
    status: factura.status ?? "unknown",
  };
}
