import "server-only";
import { rootDb } from "@/lib/db/root";
import { consultarPago, traducirEstado } from "@/lib/billing/mercadopago";
import { aplicarPagoAprobado } from "@/lib/billing/suscripcion";

/**
 * Traduce un pago de MercadoPago a un movimiento de licencia.
 *
 * Facturación es una de las tres excepciones que pueden usar `rootDb`: un webhook
 * llega sin sesión y sin empresa activa, así que no hay businessId con el cual
 * acotar hasta que se lee el pago.
 *
 * La idempotencia está en la base, no en la lógica: `SubscriptionPayment.mpPaymentId`
 * es único. El mes se suma **solo cuando la fila se creó en esta pasada**, así que
 * diez reenvíos del mismo aviso —que MercadoPago hace— suman un mes, no diez.
 */
export type ResultadoAplicacion = {
  aplicado: boolean;
  motivo: string;
  subscriptionId?: string;
};

export async function aplicarPagoDeMercadoPago(
  mpPaymentId: string,
): Promise<ResultadoAplicacion> {
  const pago = await consultarPago(mpPaymentId);
  const estado = traducirEstado(pago.status);

  if (!pago.subscriptionId) {
    return { aplicado: false, motivo: "El pago no dice a qué suscripción pertenece." };
  }

  const suscripcion = await rootDb.subscription.findUnique({
    where: { id: pago.subscriptionId },
    select: {
      id: true,
      businessId: true,
      status: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      graceUntil: true,
    },
  });

  if (!suscripcion) {
    return { aplicado: false, motivo: `No existe la suscripción ${pago.subscriptionId}.` };
  }

  return rootDb.$transaction(async (tx) => {
    const yaRegistrado = await tx.subscriptionPayment.findUnique({
      where: { mpPaymentId: pago.id },
      select: { id: true, status: true },
    });

    if (yaRegistrado) {
      // Ya se conocía. Solo se actualiza el estado —un pago aprobado puede
      // terminar en contracargo— sin volver a sumar tiempo.
      if (yaRegistrado.status !== estado) {
        await tx.subscriptionPayment.update({
          where: { id: yaRegistrado.id },
          data: { status: estado, mpStatusDetail: pago.statusDetail },
        });
      }
      return {
        aplicado: false,
        motivo: "El pago ya estaba registrado.",
        subscriptionId: suscripcion.id,
      };
    }

    const periodo =
      estado === "APROBADO"
        ? aplicarPagoAprobado(suscripcion, pago.aprobadoEn ?? new Date())
        : null;

    await tx.subscriptionPayment.create({
      data: {
        businessId: suscripcion.businessId,
        subscriptionId: suscripcion.id,
        amountCop: pago.amountCop,
        status: estado,
        mpPaymentId: pago.id,
        mpStatusDetail: pago.statusDetail,
        method: pago.method,
        paidAt: pago.aprobadoEn,
        periodStart: periodo?.currentPeriodStart ?? null,
        periodEnd: periodo?.currentPeriodEnd ?? null,
      },
    });

    if (!periodo) {
      return {
        aplicado: false,
        motivo: `El pago está ${estado.toLowerCase()}: no mueve la licencia.`,
        subscriptionId: suscripcion.id,
      };
    }

    await tx.subscription.update({
      where: { id: suscripcion.id },
      data: {
        status: periodo.status,
        currentPeriodStart: periodo.currentPeriodStart,
        currentPeriodEnd: periodo.currentPeriodEnd,
        graceUntil: periodo.graceUntil,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: suscripcion.businessId,
        action: "licencia.pago.aprobado",
        entity: "Subscription",
        entityId: suscripcion.id,
        metadata: {
          mpPaymentId: pago.id,
          montoCop: pago.amountCop,
          hasta: periodo.currentPeriodEnd.toISOString(),
        },
      },
    });

    return {
      aplicado: true,
      motivo: `Licencia extendida hasta ${periodo.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      subscriptionId: suscripcion.id,
    };
  });
}
