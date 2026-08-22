import "server-only";
import { rootDb } from "@/lib/db/root";
import { consultarFacturaDeSuscripcion, consultarPago, traducirEstado } from "@/lib/billing/mercadopago";
import { consultarAutorizacion } from "@/lib/billing/preapproval";
import { sedesDeLaMismaCuenta, sincronizarSedes } from "@/lib/billing/cuenta";
import { listaVigenteDeLaBase } from "@/lib/billing/lista";
import {
  mensualDeLaLista,
  mesesSegunMonto,
  MESES_POR_PERIODICIDAD,
} from "@/lib/billing/precios";
import { aplicarPagoAprobado } from "@/lib/billing/suscripcion";

/** Nadie compra más de un año de una vez: es el tope de seguridad del webhook. */
const MESES_MAXIMOS = 12;

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

  /**
   * Cuántos meses otorga este pago.
   *
   * La fuente buena es la metadata, porque la escribimos nosotros al crear la
   * preferencia y el cliente no la puede tocar. La red es deducirlo del monto: si
   * un aviso llegara sin metadata —MercadoPago no la garantiza en todos los
   * eventos— es preferible reconstruirlo a regalar doce meses o a cortarle el
   * servicio a alguien que pagó un año.
   *
   * Ante la duda se aplica lo MENOR: equivocarse de menos se arregla con un
   * mensaje a soporte; equivocarse de más es plata regalada que nadie audita.
   */
  const lista = await listaVigenteDeLaBase();
  const sedes = pago.sedes ?? 1;
  // Con `mensualDeLaLista` y no con la fórmula a mano: si la cuenta cae en un
  // tramo, el mensual es el del tramo, y reconstruirlo sumando daría otro número.
  // Ahí `mesesSegunMonto` no reconocería el monto y un pago de un año se
  // aplicaría como un mes.
  const mensualCop = mensualDeLaLista(lista, sedes);
  const mesesPorMonto = mesesSegunMonto(pago.amountCop, mensualCop, lista);

  const mesesCrudos = pago.meses ?? mesesPorMonto ?? 1;
  const meses = Math.min(MESES_MAXIMOS, Math.max(1, Math.trunc(mesesCrudos)));

  // Si la metadata y el monto no cuentan la misma historia, se anota: es la señal
  // de que alguien tocó una preferencia o de que la lista cambió a mitad de una compra.
  const discrepancia =
    pago.meses !== null && mesesPorMonto !== null && pago.meses !== mesesPorMonto
      ? { metadata: pago.meses, segunMonto: mesesPorMonto }
      : null;

  const periodicidad =
    (Object.keys(MESES_POR_PERIODICIDAD) as (keyof typeof MESES_POR_PERIODICIDAD)[]).find(
      (p) => MESES_POR_PERIODICIDAD[p] === meses,
    ) ?? "MENSUAL";

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

    // Buscar si ya existía un intento registrado al redirigir al checkout
    const intentoPrevio = await tx.subscriptionPayment.findFirst({
      where: {
        subscriptionId: suscripcion.id,
        status: "PENDIENTE",
        ...(pago.tipo === "SEDE_ADICIONAL" ? { periodicidad: "SEDE_ADICIONAL" } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    /**
     * Un prorrateo de sede no compra tiempo: compra un CUPO.
     *
     * Se separa acá y no en otra ruta porque todo lo demás —firma, idempotencia
     * de entrega, idempotencia de negocio, consulta del estado a la API— es
     * idéntico y no tiene sentido duplicarlo. Lo único distinto es qué se hace
     * con un pago aprobado.
     */
    if (pago.tipo === "SEDE_ADICIONAL") {
      if (intentoPrevio) {
        await tx.subscriptionPayment.update({
          where: { id: intentoPrevio.id },
          data: {
            amountCop: pago.amountCop,
            status: estado,
            mesesOtorgados: 0,
            periodicidad: "SEDE_ADICIONAL",
            sedes: pago.sedes ?? 1,
            mpPaymentId: pago.id,
            mpStatusDetail: pago.statusDetail,
            method: pago.method,
            paidAt: pago.aprobadoEn,
          },
        });
      } else {
        await tx.subscriptionPayment.create({
          data: {
            businessId: suscripcion.businessId,
            subscriptionId: suscripcion.id,
            amountCop: pago.amountCop,
            status: estado,
            mesesOtorgados: 0,
            periodicidad: "SEDE_ADICIONAL",
            sedes: pago.sedes ?? 1,
            mpPaymentId: pago.id,
            mpStatusDetail: pago.statusDetail,
            method: pago.method,
            paidAt: pago.aprobadoEn,
          },
        });
      }

      if (estado !== "APROBADO") {
        return {
          aplicado: false,
          motivo: `El pago de la sede está ${estado.toLowerCase()}: no habilita el cupo.`,
          subscriptionId: suscripcion.id,
        };
      }

      // Sumar uno y no fijar un número: la fila de pago es única por
      // `mpPaymentId`, así que diez reenvíos del mismo aviso entran una sola vez.
      const actualizada = await tx.subscription.update({
        where: { id: suscripcion.id },
        data: { maxBranches: { increment: 1 } },
        select: { maxBranches: true },
      });

      await tx.auditLog.create({
        data: {
          businessId: suscripcion.businessId,
          action: "licencia.sede.habilitada",
          entity: "Subscription",
          entityId: suscripcion.id,
          metadata: {
            mpPaymentId: pago.id,
            montoCop: pago.amountCop,
            maxBranches: actualizada.maxBranches,
          },
        },
      });

      return {
        aplicado: true,
        motivo: `Cupo habilitado: ahora puede tener ${actualizada.maxBranches} sedes.`,
        subscriptionId: suscripcion.id,
      };
    }

    const periodo =
      estado === "APROBADO"
        ? aplicarPagoAprobado(suscripcion, pago.aprobadoEn ?? new Date(), meses)
        : null;

    if (intentoPrevio) {
      await tx.subscriptionPayment.update({
        where: { id: intentoPrevio.id },
        data: {
          amountCop: pago.amountCop,
          status: estado,
          mesesOtorgados: meses,
          periodicidad,
          sedes: pago.sedes ?? 1,
          mpPaymentId: pago.id,
          mpStatusDetail: pago.statusDetail,
          method: pago.method,
          paidAt: pago.aprobadoEn,
          periodStart: periodo?.currentPeriodStart ?? null,
          periodEnd: periodo?.currentPeriodEnd ?? null,
        },
      });
    } else {
      await tx.subscriptionPayment.create({
        data: {
          businessId: suscripcion.businessId,
          subscriptionId: suscripcion.id,
          amountCop: pago.amountCop,
          status: estado,
          mesesOtorgados: meses,
          periodicidad,
          sedes: pago.sedes ?? 1,
          mpPaymentId: pago.id,
          mpStatusDetail: pago.statusDetail,
          method: pago.method,
          paidAt: pago.aprobadoEn,
          periodStart: periodo?.currentPeriodStart ?? null,
          periodEnd: periodo?.currentPeriodEnd ?? null,
        },
      });
    }

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

    // Y con ella, todas las sedes de la misma cuenta: la licencia es una sola y
    // el precio ya las cobró a todas. Sin esto, pagar $80.000 por dos sedes
    // destrababa una y dejaba la otra bloqueada.
    const hermanas = await sedesDeLaMismaCuenta(tx, suscripcion.businessId);
    await sincronizarSedes(tx, {
      businessIds: hermanas,
      exceptoBusinessId: suscripcion.businessId,
      status: periodo.status,
      currentPeriodStart: periodo.currentPeriodStart,
      currentPeriodEnd: periodo.currentPeriodEnd,
      graceUntil: periodo.graceUntil,
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
          meses,
          periodicidad,
          sedes,
          hasta: periodo.currentPeriodEnd.toISOString(),
          ...(discrepancia ? { discrepanciaDeMeses: discrepancia } : {}),
        },
      },
    });

    return {
      aplicado: true,
      motivo: `Licencia extendida ${meses} ${meses === 1 ? "mes" : "meses"}, hasta ${periodo.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      subscriptionId: suscripcion.id,
    };
  });
}

/**
 * Un cobro del débito automático.
 *
 * MercadoPago avisa con el id de una "factura" (`authorized_payment`), que por
 * dentro tiene el id del pago real. Se resuelve a ese pago y se reusa el camino
 * de siempre: idempotencia, estado consultado a la API y aplicación del período.
 * Ese pago no trae nuestra metadata —la autorización no la propaga a cada cobro—
 * así que la cantidad de meses la deduce `mesesSegunMonto` del monto, que es
 * exactamente para lo que existe esa red.
 */
export async function aplicarCobroAutomatico(invoiceId: string): Promise<ResultadoAplicacion> {
  const factura = await consultarFacturaDeSuscripcion(invoiceId);

  if (!factura.paymentId) {
    return {
      aplicado: false,
      motivo: `La factura ${invoiceId} todavía no tiene un pago asociado.`,
    };
  }

  return aplicarPagoDeMercadoPago(factura.paymentId);
}

/**
 * La autorización de débito cambió de estado.
 *
 * El caso que importa es el que duele: la tarjeta dejó de funcionar, MercadoPago
 * reintenta unos días y termina pausando la suscripción. Ahí se apaga el cobro
 * automático de este lado y se vuelve al pago manual, para que la pantalla de
 * Licencia vuelva a ofrecer el botón en vez de decir "se cobra solo" mientras no
 * se cobra nada. El correo lo manda el barrido diario, que es quien tiene el
 * permiso de hablar con Resend.
 */
export async function aplicarCambioDeAutorizacion(
  preapprovalId: string,
): Promise<ResultadoAplicacion> {
  const autorizacion = await consultarAutorizacion(preapprovalId);

  const suscripcion = await rootDb.subscription.findFirst({
    where: { mpPreapprovalId: preapprovalId },
    select: { id: true, businessId: true, cobroAutomatico: true },
  });

  if (!suscripcion) {
    return { aplicado: false, motivo: `Ninguna suscripción tiene la autorización ${preapprovalId}.` };
  }

  // `authorized` es el estado bueno y no hay nada que hacer: los cobros llegan
  // por su propio aviso.
  if (autorizacion.status === "authorized") {
    await rootDb.subscription.update({
      where: { id: suscripcion.id },
      data: { mpPayerId: autorizacion.payerId },
    });
    return { aplicado: true, motivo: "Cobro automático autorizado.", subscriptionId: suscripcion.id };
  }

  if (autorizacion.status === "pending") {
    return { aplicado: false, motivo: "La autorización todavía está pendiente." };
  }

  // `paused` o `cancelled`: se apaga de este lado y se vuelve al pago manual.
  await rootDb.subscription.update({
    where: { id: suscripcion.id },
    data: { mpPreapprovalId: null, cobroAutomatico: null },
  });

  await rootDb.auditLog.create({
    data: {
      businessId: suscripcion.businessId,
      action: "licencia.cobro-automatico.caido",
      entity: "Subscription",
      entityId: suscripcion.id,
      metadata: { preapprovalId, estadoEnMercadoPago: autorizacion.status },
    },
  });

  return {
    aplicado: true,
    motivo: `El cobro automático quedó en "${autorizacion.status}": se volvió al pago manual.`,
    subscriptionId: suscripcion.id,
  };
}
