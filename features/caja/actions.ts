"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import { abrirCajaSchema, cerrarCajaSchema, movimientoSchema } from "@/features/caja/schemas";
import { getResumenCaja } from "@/features/caja/queries";
import { getSettings } from "@/features/negocio/queries";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { currentBusinessDate } from "@/lib/time";

/**
 * Turno de caja.
 *
 * Una sola caja abierta por empresa a la vez. Dos turnos simultáneos harían que
 * el efectivo de una venta cayera en cualquiera de los dos y ninguno cuadraría al
 * cierre; el día que haya varios puntos de cobro, esto pasa a ser una caja por
 * terminal y el modelo ya lo aguanta.
 */

export const abrirCaja = defineAction({
  schema: abrirCajaSchema,
  roles: [Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);
    const businessDate = currentBusinessDate(settings);

    return db.$transaction(async (tx) => {
      const abierta = await tx.cashSession.findFirst({
        where: { status: "ABIERTA" },
        select: { id: true },
      });
      if (abierta) {
        throw new ErrorDeUsuario("Ya hay una caja abierta. Cerrala antes de abrir otra.");
      }

      // Consecutivo por jornada, no global: "caja 3" se entiende como la tercera
      // del día. El businessDate llega calculado con la zona de la empresa.
      const ultima = await tx.cashSession.findFirst({
        where: { businessDate },
        orderBy: { code: "desc" },
        select: { code: true },
      });

      const caja = await tx.cashSession.create({
        data: {
          businessId: ctx.business.id,
          code: (ultima?.code ?? 0) + 1,
          businessDate,
          openingFloatCop: input.openingFloatCop,
          openedById: ctx.user.id,
        },
        select: { id: true, code: true },
      });

      revalidatePath("/caja");
      revalidatePath("/panel");
      return caja;
    });
  },
});

export const cerrarCaja = defineAction({
  schema: cerrarCajaSchema,
  roles: [Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.CAJA,
  // Se permite cerrar la caja con la licencia vencida: si el negocio se quedó sin
  // licencia a mitad del turno, igual hay que poder contar la plata y cerrar.
  permitirSinLicencia: true,
  async handler({ input, ctx, db }) {
    const abierta = await db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true },
    });
    if (!abierta) throw new ErrorDeUsuario("No hay ninguna caja abierta.");

    const pedidosSinCobrar = await db.order.findMany({
      where: { cashSessionId: abierta.id, status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
      orderBy: { openedAt: "asc" },
      select: {
        code: true,
        customerName: true,
        table: { select: { name: true } },
        _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
      },
    });
    if (pedidosSinCobrar.length > 0) {
      // Nombrarlos y no solo contarlos: el cajero tiene que salir a buscarlos, y
      // "hay 3 pedidos sin cobrar" no le dice a cuáles mesas ir. Los vacíos se
      // señalan aparte porque se resuelven distinto —con "Cerrar sin consumo"—
      // y son justamente los que antes dejaban la caja trabada sin salida.
      const cuantos = pedidosSinCobrar.length;
      const detalle = pedidosSinCobrar
        .slice(0, 5)
        .map((pedido) => {
          const donde = pedido.table ? `Mesa ${pedido.table.name}` : `Pedido #${pedido.code}`;
          const quien = pedido.customerName?.trim();
          const etiqueta = quien ? `${donde} · ${quien}` : donde;
          return pedido._count.items === 0 ? `${etiqueta} (sin consumo)` : etiqueta;
        })
        .join(", ");
      const resto = cuantos > 5 ? ` y ${cuantos - 5} más` : "";

      throw new ErrorDeUsuario(
        `Hay ${cuantos} ${cuantos === 1 ? "cuenta" : "cuentas"} sin cobrar: ${detalle}${resto}. ` +
          "Cobralas, o cerralas sin consumo si nadie pidió nada.",
      );
    }

    const resumen = await getResumenCaja(db, abierta.id);

    // La diferencia se guarda calculada y no se recalcula al leer: lo esperado
    // depende de datos que después se pueden corregir, y el corte de anoche tiene
    // que seguir diciendo lo que decía anoche.
    const cerrada = await db.cashSession.update({
      where: { id: abierta.id },
      data: {
        status: "CERRADA",
        closedAt: new Date(),
        closedById: ctx.user.id,
        expectedCashCop: resumen.esperadoCop,
        countedCashCop: input.countedCashCop,
        differenceCop: input.countedCashCop - resumen.esperadoCop,
        notes: input.notes,
      },
      select: { id: true, differenceCop: true, expectedCashCop: true, countedCashCop: true },
    });

    revalidatePath("/caja");
    revalidatePath("/panel");
    return cerrada;
  },
});

export const registrarMovimiento = defineAction({
  schema: movimientoSchema,
  roles: [Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const abierta = await db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true },
    });
    if (!abierta) {
      throw new ErrorDeUsuario("No hay caja abierta: abrí el turno antes de registrar movimientos.");
    }

    if (input.type !== "AJUSTE" && input.amountCop <= 0) {
      throw new ErrorDeUsuario(
        "El monto tiene que ser mayor a cero. El signo lo pone el tipo de movimiento.",
      );
    }

    const movimiento = await db.cashMovement.create({
      data: {
        businessId: ctx.business.id,
        cashSessionId: abierta.id,
        type: input.type,
        amountCop: input.amountCop,
        concept: input.concept,
        createdById: ctx.user.id,
      },
      select: { id: true },
    });

    revalidatePath("/caja");
    return movimiento;
  },
});
