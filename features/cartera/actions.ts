"use server";

import { revalidatePath } from "next/cache";
import { AppModule, CashMovementType, Role } from "@/generated/prisma/enums";
import { abonoSchema, condonarSchema, consultaDeDeudaSchema } from "@/features/cartera/schemas";
import { aplicarAbono, normalizarTelefono } from "@/features/cartera/reglas";
import { getDeudaPorTelefono } from "@/features/cartera/queries";
import { cuentaDelMetodo } from "@/features/caja/medios-de-pago";
import { elegirSesionDeCobro, mensajeSinSesion } from "@/features/caja/sesion";
import { getSettings } from "@/features/negocio/queries";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { formatCop } from "@/lib/money";
import { publishCajaUpdate } from "@/lib/redis";

/**
 * Cobrar la cartera.
 *
 * **El abono NO es un `OrderPayment`.** La venta se reconoció el día que se fió;
 * registrarla otra vez como pago la contaría dos veces —una como CRÉDITO cuando
 * se fió, otra como efectivo cuando se cobró— y además dejaría `paidCop` por
 * encima del total del pedido. Lo que entra hoy es caja, no ingreso nuevo, y para
 * eso existe `CashMovement`: "entradas y salidas que no son ventas". De paso
 * aparece solo en el arqueo del turno que lo recibió, que es donde está la plata.
 */

export const registrarAbono = defineAction({
  schema: abonoSchema,
  roles: [Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);
    if (!settings.creditoEnabled) {
      throw new ErrorDeUsuario("Este negocio no tiene el crédito habilitado.");
    }

    const resultado = await db.$transaction(async (tx) => {
      const deudor = await tx.deudor.findFirst({
        where: { id: input.deudorId, deletedAt: null },
        select: { id: true, nombre: true },
      });
      if (!deudor) throw new ErrorDeUsuario("Esa persona no está en la cartera.");

      // La caja sale de quién cobra, con la misma regla que un pago: si no, el
      // abono cae en el arqueo de otra persona.
      const elegida = await elegirSesionDeCobro(tx, ctx.user.id);
      if (!elegida.ok) throw new ErrorDeUsuario(mensajeSinSesion(elegida.motivo, "recibir un abono"));

      const fiados = await tx.fiado.findMany({
        where: { deudorId: deudor.id, saldoCop: { gt: 0 }, condonadoEn: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, saldoCop: true, order: { select: { code: true } } },
      });

      const reparto = aplicarAbono(fiados, input.montoCop);

      if (reparto.aplicadoCop === 0) {
        throw new ErrorDeUsuario(`${deudor.nombre} no debe nada.`);
      }
      if (reparto.sobranteCop > 0) {
        // Recibir de más no es un abono: es un error de tecleo. Se dice cuánto
        // debe en vez de guardar un saldo a favor, que es otro producto.
        const debeCop = fiados.reduce((t, f) => t + f.saldoCop, 0);
        throw new ErrorDeUsuario(
          `${deudor.nombre} debe ${formatCop(debeCop)}, y el abono es de ${formatCop(input.montoCop)}.`,
        );
      }

      const cuenta = cuentaDelMetodo(input.method);
      if (cuenta !== "EFECTIVO" && cuenta !== "BANCO") {
        throw new ErrorDeUsuario("Ese medio de pago no entra a ningún saldo de la caja.");
      }

      // El movimiento de caja es lo que mete el abono al arqueo del turno.
      const movimiento = await tx.cashMovement.create({
        data: {
          businessId: ctx.business.id,
          cashSessionId: elegida.cashSessionId,
          type: CashMovementType.INGRESO,
          account: cuenta,
          amountCop: input.montoCop,
          concept: `Abono de cartera · ${deudor.nombre}`,
          createdById: ctx.user.id,
        },
        select: { id: true },
      });

      const abono = await tx.abonoDeCartera.create({
        data: {
          businessId: ctx.business.id,
          deudorId: deudor.id,
          montoCop: input.montoCop,
          method: input.method,
          cashMovementId: movimiento.id,
          cashSessionId: elegida.cashSessionId,
          recibidoPorId: ctx.user.id,
          nota: input.nota ?? null,
        },
        select: { id: true },
      });

      const ahora = new Date();
      const saldados: number[] = [];

      for (const aplicacion of reparto.aplicaciones) {
        const fiado = fiados.find((f) => f.id === aplicacion.fiadoId)!;

        await tx.aplicacionDeAbono.create({
          data: {
            businessId: ctx.business.id,
            abonoId: abono.id,
            fiadoId: fiado.id,
            montoCop: aplicacion.aplicadoCop,
          },
        });

        await tx.fiado.update({
          where: { id: fiado.id },
          data: {
            saldoCop: { decrement: aplicacion.aplicadoCop },
            ...(aplicacion.saldaCompleto ? { saldadoEn: ahora } : {}),
          },
        });

        if (aplicacion.saldaCompleto) saldados.push(fiado.order.code);
      }

      const quedaCop =
        fiados.reduce((t, f) => t + f.saldoCop, 0) - reparto.aplicadoCop;

      await tx.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "cartera.abonar",
          entity: "Deudor",
          entityId: deudor.id,
          metadata: { montoCop: input.montoCop, method: input.method, saldados, quedaCop },
        },
      });

      return { saldados, quedaCop, deudor: deudor.nombre };
    });

    revalidatePath("/cartera");
    revalidatePath("/caja");
    void publishCajaUpdate(ctx.business.id);

    return resultado;
  },
});

export const condonarFiado = defineAction({
  schema: condonarSchema,
  // Perdonar una deuda es plata que el negocio decide perder: la decide el dueño,
  // no quien está en el mostrador. Es el mismo criterio que la clave de salidas.
  roles: [Role.PROPIETARIO],
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const resultado = await db.$transaction(async (tx) => {
      const fiado = await tx.fiado.findFirst({
        where: { id: input.fiadoId },
        select: {
          id: true,
          saldoCop: true,
          condonadoEn: true,
          deudor: { select: { id: true, nombre: true } },
          order: { select: { code: true } },
        },
      });
      if (!fiado) throw new ErrorDeUsuario("Ese fiado no existe.");
      if (fiado.condonadoEn) throw new ErrorDeUsuario("Esa deuda ya estaba perdonada.");
      if (fiado.saldoCop <= 0) throw new ErrorDeUsuario("Ese fiado ya está saldado.");

      const perdonadoCop = fiado.saldoCop;

      await tx.fiado.update({
        where: { id: fiado.id },
        data: {
          saldoCop: 0,
          condonadoEn: new Date(),
          condonadoPorId: ctx.user.id,
          condonadoMotivo: input.motivo,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "cartera.condonar",
          entity: "Fiado",
          entityId: fiado.id,
          metadata: {
            deudor: fiado.deudor.nombre,
            pedido: fiado.order.code,
            perdonadoCop,
            motivo: input.motivo,
          },
        },
      });

      return { perdonadoCop, deudor: fiado.deudor.nombre };
    });

    revalidatePath("/cartera");
    return resultado;
  },
});

/**
 * Cuánto debe un teléfono. La usa el formulario de cobro mientras se teclea.
 *
 * Es de solo lectura y devuelve lo mínimo —nombre, dirección y saldo— para poder
 * decir "ya debe $45.000" antes de fiarle otra vez.
 */
export const consultarDeuda = defineAction({
  schema: consultaDeDeudaSchema,
  roles: [Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.CAJA,
  async handler({ input, ctx }) {
    return getDeudaPorTelefono(ctx.business.id, normalizarTelefono(input.telefono));
  },
});
