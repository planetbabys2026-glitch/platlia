"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
// eslint-disable-next-line no-restricted-imports -- La licencia es de la cuenta, no de una sede: se escribe sobre la sede principal, que puede no ser la activa.
import { rootDb } from "@/lib/db/root";
import { cuentaDelPropietario } from "@/lib/billing/cuenta";
import { listaVigenteDeLaBase } from "@/lib/billing/lista";
import { crearPreferenciaDePago } from "@/lib/billing/mercadopago";
import { cancelarAutorizacion, crearAutorizacionDeCobro } from "@/lib/billing/preapproval";
import { cotizar, listaParaNegocio, NOMBRE_PERIODICIDAD } from "@/lib/billing/precios";
import { prorratearSedeNueva } from "@/lib/billing/prorrateo";
import {
  activarCobroAutomaticoSchema,
  pagarSuscripcionSchema,
  solicitarSedeAdicionalSchema,
} from "./schemas";

/**
 * Iniciar el pago de la suscripción.
 *
 * `permitirSinLicencia` es lo único que importa acá: si esta acción exigiera
 * licencia vigente, un negocio vencido no podría pagar para dejar de estarlo.
 *
 * El cliente elige la duración; el monto lo calcula el servidor con la lista
 * vigente. Nunca al revés: esto es un POST y aceptar un precio de afuera sería
 * dejar que el cliente ponga el precio.
 */
export const pagarSuscripcion = defineAction({
  schema: pagarSuscripcionSchema,
  roles: [Role.ADMINISTRADOR],
  permitirSinLicencia: true,
  async handler({ input, ctx }) {
    /**
     * Se cobra la CUENTA, no la sede donde uno está parado.
     *
     * Cada sede tiene su fila de `Subscription`, pero la licencia es una sola y
     * cubre a todas. Cuando el precio pasó a depender de la cantidad de sedes,
     * cobrar por sede significó cobrar `50.000 + 30.000×(n−1)` en cada una: dos
     * sedes salían $160.000 en vez de $80.000. Se cobra la principal y después se
     * sincronizan las demás.
     */
    const cuenta = await cuentaDelPropietario(ctx.user.id);
    if (!cuenta) {
      throw new ErrorDeUsuario(
        "Este negocio no tiene una suscripción. Escribinos y la creamos.",
      );
    }
    if (cuenta.status === "CANCELADA") {
      throw new ErrorDeUsuario(
        "La suscripción está cancelada. Escribinos para reactivarla.",
      );
    }

    // El precio propio de la empresa manda salvo que haya una promoción vigente.
    const lista = listaParaNegocio(await listaVigenteDeLaBase(), cuenta.priceCop);
    const sedes = cuenta.sedes;
    const cotizacion = cotizar({ lista, sedes, periodicidad: input.periodicidad });

    const preferencia = await crearPreferenciaDePago({
      businessId: cuenta.principalBusinessId,
      subscriptionId: cuenta.subscriptionId,
      nombreNegocio: cuenta.principalNombre,
      precioCop: cotizacion.totalCop,
      meses: cotizacion.mesesOtorgados,
      sedes: cotizacion.sedes,
      detallePlan: `${NOMBRE_PERIODICIDAD[input.periodicidad]} · ${sedes} ${sedes === 1 ? "sede" : "sedes"}`,
    });

    // El intento queda anotado ANTES de salir del sitio. Sin esto, un pago que no
    // dispare webhook —o que el cliente abandone en MercadoPago— no dejaba ningún
    // rastro de que alguien había intentado pagar, y soporte no tenía qué mirar.
    //
    // Va por `rootDb` y no por `db`: el pago pertenece a la sede PRINCIPAL, que
    // puede no ser en la que uno está parado, y `tenantDb` pisa el `businessId`
    // del `data` con el de la sesión sin avisar. Facturación es una de las tres
    // excepciones previstas para `rootDb`.
    await rootDb.subscriptionPayment.create({
      data: {
        businessId: cuenta.principalBusinessId,
        subscriptionId: cuenta.subscriptionId,
        amountCop: cotizacion.totalCop,
        status: "PENDIENTE",
        mesesOtorgados: cotizacion.mesesOtorgados,
        periodicidad: input.periodicidad,
        sedes: cotizacion.sedes,
        mpPreferenceId: preferencia.id,
      },
    });

    // Se sale del sitio: el pago ocurre en MercadoPago y nunca vemos una tarjeta.
    redirect(preferencia.urlDePago);
  },
});

/**
 * Solicitud de sede adicional o cambio de plan enviada por el propietario.
 */
export const solicitarSedeAdicional = defineAction({
  schema: solicitarSedeAdicionalSchema,
  roles: [Role.PROPIETARIO],
  permitirSinLicencia: true,
  async handler({ input, ctx, db }) {
    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "SOLICITUD_SEDE_ADICIONAL",
        entity: "Business",
        entityId: ctx.business.id,
        metadata: {
          cantidadSedes: input.cantidadSedes,
          periodoMeses: input.periodoMeses,
          observaciones: input.observaciones ?? null,
          solicitadoPor: ctx.user.email,
          nombreNegocio: ctx.business.name,
        },
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/facturacion");
  },
});

/**
 * Comprar el cupo para una sede más.
 *
 * Se compra el CUPO y después se crea la sede, en vez de crear la sede y esperar
 * que alguien pague: así el webhook solo tiene que incrementar un número —una
 * operación mínima, idempotente y reversible— en lugar de fabricar un negocio
 * entero con su configuración, sus impuestos y su membresía desde un aviso HTTP.
 *
 * Se cobra el prorrateo de lo que queda del período: quien agrega una sede el día
 * 25 no tiene por qué pagar el mes completo, y desde la renovación siguiente la
 * licencia ya vale lo que vale con la sede nueva.
 */
export const comprarSedeAdicional = defineAction({
  schema: z.object({}),
  roles: [Role.PROPIETARIO],
  permitirSinLicencia: true,
  async handler({ ctx }) {
    const cuenta = await cuentaDelPropietario(ctx.user.id);
    if (!cuenta) throw new ErrorDeUsuario("Este negocio no tiene una suscripción.");

    if (cuenta.status === "PRUEBA") {
      throw new ErrorDeUsuario(
        "La prueba gratuita no incluye sedes adicionales. Comprá una licencia y después sumá las sedes que necesites.",
      );
    }
    if (cuenta.status === "CANCELADA" || cuenta.status === "SUSPENDIDA") {
      throw new ErrorDeUsuario("La suscripción no está activa. Escribinos y lo resolvemos.");
    }

    // De tres sedes en adelante se negocia: el cupo lo habilita soporte.
    if (cuenta.sedes >= 2) {
      throw new ErrorDeUsuario(
        "Para una tercera sede en adelante coordinamos una tarifa de cadena. Escribinos por WhatsApp y lo vemos.",
      );
    }

    const lista = listaParaNegocio(await listaVigenteDeLaBase(), cuenta.priceCop);
    const prorrateo = prorratearSedeNueva({
      lista,
      sedesActuales: cuenta.sedes,
      inicioPeriodo: cuenta.currentPeriodStart,
      finPeriodo: cuenta.currentPeriodEnd,
    });

    // Con el período vencido no hay prorrateo que cobrar: lo que corresponde es
    // renovar, y ahí la sede nueva ya entra en el precio del período completo.
    if (prorrateo.montoCop <= 0) {
      throw new ErrorDeUsuario(
        "Tu licencia está vencida. Renovala primero y después sumás la sede, así no pagás dos veces.",
      );
    }

    const preferencia = await crearPreferenciaDePago({
      businessId: cuenta.principalBusinessId,
      subscriptionId: cuenta.subscriptionId,
      nombreNegocio: cuenta.principalNombre,
      precioCop: prorrateo.montoCop,
      meses: 0,
      sedes: cuenta.sedes + 1,
      detallePlan: `Sede adicional · ${prorrateo.diasRestantes} días restantes`,
      tipo: "SEDE_ADICIONAL",
    });

    await rootDb.subscriptionPayment.create({
      data: {
        businessId: cuenta.principalBusinessId,
        subscriptionId: cuenta.subscriptionId,
        amountCop: prorrateo.montoCop,
        status: "PENDIENTE",
        mesesOtorgados: 0,
        periodicidad: "SEDE_ADICIONAL",
        sedes: cuenta.sedes + 1,
        mpPreferenceId: preferencia.id,
      },
    });

    redirect(preferencia.urlDePago);
  },
});

/**
 * Encender el cobro automático.
 *
 * El primer débito se agenda para el **fin del período ya pagado**: quien lo
 * enciende faltándole veinte días no puede terminar pagando dos veces por los
 * mismos veinte días. Si la licencia ya venció, la fecha queda en el pasado y
 * MercadoPago cobra al autorizar, que es exactamente lo que corresponde.
 */
export const activarCobroAutomatico = defineAction({
  schema: activarCobroAutomaticoSchema,
  roles: [Role.ADMINISTRADOR],
  permitirSinLicencia: true,
  async handler({ input, ctx }) {
    const cuenta = await cuentaDelPropietario(ctx.user.id);
    if (!cuenta) throw new ErrorDeUsuario("Este negocio no tiene una suscripción.");
    if (cuenta.status === "CANCELADA") {
      throw new ErrorDeUsuario("La suscripción está cancelada. Escribinos para reactivarla.");
    }

    const sub = await rootDb.subscription.findUnique({
      where: { id: cuenta.subscriptionId },
      select: { mpPreapprovalId: true },
    });
    if (sub?.mpPreapprovalId) {
      throw new ErrorDeUsuario("El cobro automático ya está activo.");
    }

    const lista = listaParaNegocio(await listaVigenteDeLaBase(), cuenta.priceCop);
    const cotizacion = cotizar({
      lista,
      sedes: cuenta.sedes,
      periodicidad: input.frecuencia === "ANUAL" ? "ANUAL" : "MENSUAL",
    });

    const autorizacion = await crearAutorizacionDeCobro({
      subscriptionId: cuenta.subscriptionId,
      nombreNegocio: cuenta.principalNombre,
      correoDelPagador: ctx.user.email,
      montoCop: cotizacion.totalCop,
      frecuencia: input.frecuencia,
      primerCobro: cuenta.currentPeriodEnd ?? new Date(),
    });

    // Se guarda ANTES de mandarlo a autorizar: si vuelve por el webhook antes de
    // que termine de navegar, la suscripción ya sabe de qué autorización se trata.
    await rootDb.subscription.update({
      where: { id: cuenta.subscriptionId },
      data: { mpPreapprovalId: autorizacion.id, cobroAutomatico: input.frecuencia },
    });

    redirect(autorizacion.urlDeAutorizacion);
  },
});

/**
 * Apagar el cobro automático.
 *
 * **No apaga la licencia.** Lo que ya se pagó se usa hasta el final y recién
 * después entra la gracia normal. Cortar el servicio en el momento sería cobrar
 * por días que no se dan, y es justamente lo que hace que la gente le tenga miedo
 * al botón de cancelar.
 */
export const cancelarCobroAutomatico = defineAction({
  schema: z.object({}),
  roles: [Role.ADMINISTRADOR],
  permitirSinLicencia: true,
  async handler({ ctx }) {
    const cuenta = await cuentaDelPropietario(ctx.user.id);
    if (!cuenta) throw new ErrorDeUsuario("Este negocio no tiene una suscripción.");

    const sub = await rootDb.subscription.findUnique({
      where: { id: cuenta.subscriptionId },
      select: { mpPreapprovalId: true },
    });
    if (!sub?.mpPreapprovalId) {
      throw new ErrorDeUsuario("El cobro automático no está activo.");
    }

    await cancelarAutorizacion(sub.mpPreapprovalId);

    await rootDb.subscription.update({
      where: { id: cuenta.subscriptionId },
      data: { mpPreapprovalId: null, cobroAutomatico: null },
    });

    await rootDb.auditLog.create({
      data: {
        businessId: cuenta.principalBusinessId,
        userId: ctx.user.id,
        action: "licencia.cobro-automatico.cancelado",
        entity: "Subscription",
        entityId: cuenta.subscriptionId,
        metadata: { hasta: cuenta.currentPeriodEnd?.toISOString() ?? null },
      },
    });

    revalidatePath("/facturacion");
  },
});
