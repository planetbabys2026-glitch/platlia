"use server";

import { revalidatePath } from "next/cache";
import { AppModule, OrderType, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { recalcularTotales } from "@/features/pedidos/totales";
import {
  abrirPedidoSchema,
  agregarItemSchema,
  anularItemSchema,
  anularPedidoSchema,
  cambiarCantidadSchema,
  pagoSchema,
  pedidoSchema,
  propinaSchema,
} from "@/features/pedidos/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { computeTaxLine } from "@/lib/tax";
import { currentBusinessDate } from "@/lib/time";
import { siguienteTurno } from "@/lib/turns";

/** Roles que atienden el salón: todos menos cocina. */
const ATIENDEN = [Role.MESERO, Role.CAJERO, Role.ADMINISTRADOR] as const;
const COBRAN = [Role.CAJERO, Role.ADMINISTRADOR] as const;

/** Choque de un índice único: dos pedidos pidieron el mismo consecutivo a la vez. */
function esConflictoDeUnicidad(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Reintenta ante un choque de consecutivo.
 *
 * Dos meseros que abren mesa en el mismo segundo piden el mismo número. El índice
 * único de (empresa, jornada, código) lo impide en la base —que es donde tiene
 * que impedirse— y acá simplemente se vuelve a intentar con el siguiente.
 */
async function conReintento<T>(fn: () => Promise<T>, intentos = 5): Promise<T> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!esConflictoDeUnicidad(error) || i === intentos - 1) throw error;
    }
  }
  throw new Error("inalcanzable");
}

export const abrirPedido = defineAction({
  schema: abrirPedidoSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);
    const businessDate = currentBusinessDate(settings);

    const caja = await db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true },
    });
    if (settings.requireOpenCashSession && !caja) {
      throw new ErrorDeUsuario(
        "No hay caja abierta. Abrí el turno antes de tomar pedidos, o desactivá esa exigencia en la configuración.",
      );
    }

    return conReintento(() =>
      db.$transaction(async (tx) => {
        if (input.tableId) {
          const mesa = await tx.table.findFirst({
            where: { id: input.tableId, deletedAt: null },
            select: { id: true, name: true, status: true },
          });
          if (!mesa) throw new ErrorDeUsuario("Esa mesa no existe.");
          if (mesa.status === "INACTIVA") {
            throw new ErrorDeUsuario(`La mesa ${mesa.name} está fuera de servicio.`);
          }

          const ocupada = await tx.order.findFirst({
            where: { tableId: mesa.id, status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
            select: { id: true },
          });
          if (ocupada) {
            throw new ErrorDeUsuario(
              `La mesa ${mesa.name} ya tiene un pedido abierto. Abrilo en vez de crear otro.`,
            );
          }
        }

        const ultimo = await tx.order.findFirst({
          where: { businessDate },
          orderBy: { code: "desc" },
          select: { code: true },
        });

        // El turno solo aplica a lo que el cliente espera; una mesa se llama por
        // su número, no por turno.
        let turnNumber: number | null = null;
        if (input.type !== OrderType.MESA) {
          const ultimoTurno = await tx.order.findFirst({
            where: { businessDate, turnNumber: { not: null } },
            orderBy: { turnNumber: "desc" },
            select: { turnNumber: true },
          });
          turnNumber = siguienteTurno(ultimoTurno?.turnNumber ?? null, settings.turnNumberMax);
        }

        const pedido = await tx.order.create({
          data: {
            businessId: ctx.business.id,
            code: (ultimo?.code ?? 0) + 1,
            businessDate,
            turnNumber,
            type: input.type,
            tableId: input.tableId ?? null,
            cashSessionId: caja?.id ?? null,
            guestsCount: input.guestsCount ?? null,
            customerName: input.customerName ?? null,
            customerPhone: input.customerPhone ?? null,
            deliveryAddress: input.deliveryAddress ?? null,
            openedById: ctx.user.id,
          },
          select: { id: true, code: true, turnNumber: true },
        });

        if (input.tableId) {
          await tx.table.update({
            where: { id: input.tableId },
            data: { status: "OCUPADA" },
          });
        }

        return pedido;
      }),
    ).then((pedido) => {
      revalidatePath("/salon");
      revalidatePath(`/pedido/${pedido.id}`);
      return pedido;
    });
  },
});

export const agregarItem = defineAction({
  schema: agregarItemSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);

    await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: { id: true, status: true },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (pedido.status === "PAGADA" || pedido.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado: no se le pueden agregar cosas.");
      }

      const producto = await tx.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: {
          id: true,
          name: true,
          priceCop: true,
          isAvailable: true,
          active: true,
          trackStock: true,
          taxRate: { select: { rateBp: true, name: true } },
        },
      });
      if (!producto || !producto.active) throw new ErrorDeUsuario("Ese producto no existe.");
      if (!producto.isAvailable) {
        throw new ErrorDeUsuario(`${producto.name} está marcado como agotado.`);
      }

      let nombre = producto.name;
      let precio = producto.priceCop;

      if (input.variantId) {
        const variante = await tx.productVariant.findFirst({
          where: { id: input.variantId, productId: producto.id, active: true },
          select: { name: true, priceCop: true },
        });
        if (!variante) throw new ErrorDeUsuario("Esa presentación no existe.");
        nombre = `${producto.name} (${variante.name})`;
        precio = variante.priceCop;
      }

      // Acá se congela todo: nombre, precio y tarifa. Un tiquete reimpreso en seis
      // meses tiene que salir idéntico aunque el producto haya cambiado de precio
      // o el negocio haya cambiado de régimen de impuesto.
      const linea = computeTaxLine({
        unitPriceCop: precio,
        quantity: input.quantity,
        taxRateBp: producto.taxRate.rateBp,
        taxIncluded: settings.pricesIncludeTax,
      });

      await tx.orderItem.create({
        data: {
          businessId: ctx.business.id,
          orderId: pedido.id,
          productId: producto.id,
          variantId: input.variantId ?? null,
          nameSnapshot: nombre,
          unitPriceCop: precio,
          taxRateBpSnapshot: producto.taxRate.rateBp,
          taxRateNameSnapshot: producto.taxRate.name,
          taxIncludedSnapshot: settings.pricesIncludeTax,
          quantity: input.quantity,
          lineSubtotalCop: linea.lineSubtotalCop,
          lineTaxCop: linea.lineTaxCop,
          lineTotalCop: linea.lineTotalCop,
          notes: input.notes ?? null,
          createdById: ctx.user.id,
        },
      });

      // El inventario puede quedar negativo a propósito: un bar no puede negarse a
      // vender porque el conteo está desactualizado. El número negativo es la
      // señal de que hay que hacer inventario, no un freno.
      if (producto.trackStock) {
        await tx.product.update({
          where: { id: producto.id },
          data: { stockQty: { decrement: input.quantity } },
        });
      }

      await recalcularTotales(tx, pedido.id);
    });

    revalidatePath(`/pedido/${input.orderId}`);
  },
});

export const cambiarCantidad = defineAction({
  schema: cambiarCantidadSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    const orderId = await db.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: input.itemId },
        select: {
          id: true,
          orderId: true,
          quantity: true,
          unitPriceCop: true,
          discountCop: true,
          taxRateBpSnapshot: true,
          taxIncludedSnapshot: true,
          status: true,
          productId: true,
          product: { select: { trackStock: true } },
          order: { select: { status: true } },
        },
      });
      if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");
      if (item.status === "ANULADO") throw new ErrorDeUsuario("Ese renglón está anulado.");
      if (item.order.status === "PAGADA" || item.order.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado.");
      }

      // Se recalcula con la tarifa CONGELADA en el renglón, no con la vigente.
      const linea = computeTaxLine({
        unitPriceCop: item.unitPriceCop,
        quantity: input.quantity,
        taxRateBp: item.taxRateBpSnapshot,
        taxIncluded: item.taxIncludedSnapshot,
        discountCop: item.discountCop,
      });

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          quantity: input.quantity,
          lineSubtotalCop: linea.lineSubtotalCop,
          lineTaxCop: linea.lineTaxCop,
          lineTotalCop: linea.lineTotalCop,
        },
      });

      if (item.product.trackStock) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity - input.quantity } },
        });
      }

      await recalcularTotales(tx, item.orderId);
      return item.orderId;
    });

    revalidatePath(`/pedido/${orderId}`);
  },
});

export const anularItem = defineAction({
  schema: anularItemSchema,
  roles: COBRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const orderId = await db.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: input.itemId },
        select: {
          id: true,
          orderId: true,
          quantity: true,
          nameSnapshot: true,
          lineTotalCop: true,
          status: true,
          productId: true,
          product: { select: { trackStock: true } },
          order: { select: { status: true, code: true } },
        },
      });
      if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");
      if (item.status === "ANULADO") throw new ErrorDeUsuario("Ese renglón ya estaba anulado.");
      if (item.order.status === "PAGADA" || item.order.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado.");
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          status: "ANULADO",
          canceledAt: new Date(),
          canceledById: ctx.user.id,
          canceledReason: input.motivo,
        },
      });

      if (item.product.trackStock) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }

      // Una anulación es de lo que después se discute: queda en la bitácora con
      // quién, qué, cuánto y por qué.
      await tx.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "pedido.item.anular",
          entity: "OrderItem",
          entityId: item.id,
          metadata: {
            pedido: item.order.code,
            producto: item.nameSnapshot,
            cantidad: item.quantity,
            valorCop: item.lineTotalCop,
            motivo: input.motivo,
          },
        },
      });

      await recalcularTotales(tx, item.orderId);
      return item.orderId;
    });

    revalidatePath(`/pedido/${orderId}`);
  },
});

export const pedirCuenta = defineAction({
  schema: pedidoSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, status: true, tableId: true },
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
    if (pedido.status !== "ABIERTA") {
      throw new ErrorDeUsuario("La cuenta ya fue pedida o el pedido está cerrado.");
    }

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: pedido.id },
        data: { status: "CUENTA_PEDIDA", billRequestedAt: new Date() },
      });
      if (pedido.tableId) {
        await tx.table.update({
          where: { id: pedido.tableId },
          data: { status: "CUENTA_PEDIDA" },
        });
      }
    });

    revalidatePath("/salon");
    revalidatePath(`/pedido/${pedido.id}`);
  },
});

export const ponerPropina = defineAction({
  schema: propinaSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: { id: true, status: true },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (pedido.status === "PAGADA" || pedido.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado.");
      }

      await tx.order.update({ where: { id: pedido.id }, data: { tipCop: input.tipCop } });
      await recalcularTotales(tx, pedido.id);
    });

    revalidatePath(`/pedido/${input.orderId}`);
  },
});

export const registrarPago = defineAction({
  schema: pagoSchema,
  roles: COBRAN,
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);

    const resultado = await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: {
          id: true,
          status: true,
          totalCop: true,
          paidCop: true,
          tableId: true,
          cashSessionId: true,
        },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (pedido.status === "PAGADA") throw new ErrorDeUsuario("El pedido ya está pagado.");
      if (pedido.status === "ANULADA") throw new ErrorDeUsuario("El pedido está anulado.");

      const caja = await tx.cashSession.findFirst({
        where: { status: "ABIERTA" },
        select: { id: true },
      });
      if (!caja) {
        throw new ErrorDeUsuario("No hay caja abierta: no se puede recibir un pago.");
      }

      let changeCop: number | null = null;
      if (input.method === "EFECTIVO" && input.tenderedCop !== undefined) {
        if (input.tenderedCop < input.amountCop) {
          throw new ErrorDeUsuario("Con lo que entregó no alcanza para cubrir el pago.");
        }
        changeCop = input.tenderedCop - input.amountCop;
      }

      await tx.orderPayment.create({
        data: {
          businessId: ctx.business.id,
          orderId: pedido.id,
          cashSessionId: caja.id,
          method: input.method,
          amountCop: input.amountCop,
          tenderedCop: input.tenderedCop ?? null,
          changeCop,
          reference: input.reference ?? null,
          receivedById: ctx.user.id,
        },
      });

      const totales = await recalcularTotales(tx, pedido.id);
      const faltante = totales.totalCop - totales.paidCop;

      // El pedido se cierra cuando está pagado, o cuando lo que falta es menos que
      // el múltiplo de redondeo del efectivo: con un total de $18.925 y monedas de
      // $50, el cliente paga $18.900 y esos 25 pesos no son una deuda.
      const huboEfectivo =
        input.method === "EFECTIVO" ||
        (await tx.orderPayment.count({
          where: { orderId: pedido.id, method: "EFECTIVO", voidedAt: null },
        })) > 0;
      const cerrado =
        faltante <= 0 || (huboEfectivo && faltante > 0 && faltante < settings.cashRoundingCop);

      if (cerrado) {
        await tx.order.update({
          where: { id: pedido.id },
          data: {
            status: "PAGADA",
            closedAt: new Date(),
            closedById: ctx.user.id,
            // Si el pedido se abrió sin caja, se cuelga de la que lo cobró: el
            // corte tiene que incluirlo.
            cashSessionId: pedido.cashSessionId ?? caja.id,
          },
        });
        if (pedido.tableId) {
          await tx.table.update({ where: { id: pedido.tableId }, data: { status: "LIBRE" } });
        }
      }

      return { cerrado, faltanteCop: Math.max(0, faltante), changeCop, totales };
    });

    revalidatePath("/salon");
    revalidatePath("/caja");
    revalidatePath(`/pedido/${input.orderId}`);
    return resultado;
  },
});

export const anularPedido = defineAction({
  schema: anularPedidoSchema,
  roles: [Role.ADMINISTRADOR],
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: { id: true, code: true, status: true, totalCop: true, tableId: true },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (pedido.status === "ANULADA") throw new ErrorDeUsuario("Ese pedido ya estaba anulado.");
      if (pedido.status === "PAGADA") {
        throw new ErrorDeUsuario(
          "Un pedido pagado no se anula: hay que registrar la devolución del pago.",
        );
      }

      await tx.order.update({
        where: { id: pedido.id },
        data: {
          status: "ANULADA",
          canceledAt: new Date(),
          canceledById: ctx.user.id,
          canceledReason: input.motivo,
        },
      });

      if (pedido.tableId) {
        await tx.table.update({ where: { id: pedido.tableId }, data: { status: "LIBRE" } });
      }

      await tx.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "pedido.anular",
          entity: "Order",
          entityId: pedido.id,
          metadata: {
            pedido: pedido.code,
            valorCop: pedido.totalCop,
            motivo: input.motivo,
          },
        },
      });
    });

    revalidatePath("/salon");
    revalidatePath(`/pedido/${input.orderId}`);
  },
});
