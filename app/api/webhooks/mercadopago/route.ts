import type { NextRequest } from "next/server";
import { aplicarPagoDeMercadoPago } from "@/lib/billing/aplicar-pago";
import { verificarFirma } from "@/lib/billing/firma";
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { env } from "@/lib/env";

/**
 * Webhook de MercadoPago.
 *
 * Es una URL pública que mueve el estado de la licencia, así que se defiende en
 * tres capas:
 *
 *  1. **Firma.** Sin `x-signature` válida no se procesa nada. Se apaga solo en
 *     staging con MP_SIGNATURE_ENFORCE=false, para capturar un aviso real.
 *  2. **Idempotencia de entrega.** El aviso se guarda en MpWebhookEvent con su id
 *     único; el segundo intento choca contra el índice y no se reprocesa.
 *  3. **Idempotencia de negocio.** El mes se suma una sola vez porque
 *     SubscriptionPayment.mpPaymentId es único.
 *
 * Siempre responde 200 salvo que la firma falle. MercadoPago reintenta ante
 * cualquier otro código, y un aviso que nunca vamos a poder procesar —de una
 * suscripción borrada, por ejemplo— reintentado para siempre es ruido.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const crudo = await request.text();

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = crudo ? (JSON.parse(crudo) as Record<string, unknown>) : {};
  } catch {
    return Response.json({ error: "cuerpo ilegible" }, { status: 400 });
  }

  const url = new URL(request.url);
  const data = (cuerpo.data ?? {}) as Record<string, unknown>;
  const dataId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    (typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : null);
  const tipo = String(cuerpo.type ?? url.searchParams.get("type") ?? "desconocido");

  // ── 1. Firma ──────────────────────────────────────────────────────────────
  if (env.MP_SIGNATURE_ENFORCE) {
    const resultado = verificarFirma({
      cabeceraFirma: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
      secreto: env.MP_WEBHOOK_SECRET ?? "",
    });

    if (!resultado.valida) {
      console.warn("[mp-webhook] firma rechazada:", resultado.motivo);
      return Response.json({ error: "firma inválida" }, { status: 401 });
    }
  }

  // Solo interesan los avisos de pago; el resto se acepta y se ignora.
  if (tipo !== "payment") {
    return Response.json({ recibido: true, ignorado: tipo });
  }
  if (!dataId) {
    return Response.json({ recibido: true, ignorado: "sin data.id" });
  }

  // ── 2. Idempotencia de entrega ────────────────────────────────────────────
  const idDelAviso = String(cuerpo.id ?? `${tipo}:${dataId}`);

  try {
    await rootDb.mpWebhookEvent.create({
      data: { mpEventId: idDelAviso, type: tipo, payload: cuerpo as never },
    });
  } catch {
    // Choque contra el índice único: ya se procesó esta entrega.
    return Response.json({ recibido: true, repetido: true });
  }

  // ── 3. Aplicación ─────────────────────────────────────────────────────────
  try {
    const resultado = await aplicarPagoDeMercadoPago(dataId);

    await rootDb.mpWebhookEvent.update({
      where: { mpEventId: idDelAviso },
      data: { processedAt: new Date(), error: resultado.aplicado ? null : resultado.motivo },
    });

    return Response.json({ recibido: true, ...resultado });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[mp-webhook] no se pudo aplicar el pago", error);

    await rootDb.mpWebhookEvent.update({
      where: { mpEventId: idDelAviso },
      data: { error: mensaje.slice(0, 500) },
    });

    // 200 a propósito: el aviso quedó guardado con su error y se puede reprocesar
    // a mano. Devolver 500 haría que MercadoPago lo reintente cada pocos minutos
    // durante días.
    return Response.json({ recibido: true, error: mensaje }, { status: 200 });
  }
}
