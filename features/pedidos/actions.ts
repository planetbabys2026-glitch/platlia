"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { recalcularTotales } from "@/features/pedidos/totales";
import { siguienteTurnoLibre } from "@/features/pedidos/turnos";
import {
  abrirPedidoSchema,
  agregarItemSchema,
  anularItemSchema,
  anularPedidoSchema,
  cambiarCantidadSchema,
  pagoSchema,
  pedidoSchema,
  ponerNotaItemSchema,
  propinaSchema,
  quitarItemSchema,
} from "@/features/pedidos/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { tieneRol } from "@/lib/auth/reglas";
import { computeTaxLine } from "@/lib/tax";
import { currentBusinessDate } from "@/lib/time";

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

        // El turno NO se reparte acá. Se asigna recién cuando el pedido se cobra
        // (registrarPago): en un mostrador de venta rápida, el turnero no tiene
        // por qué gritar un número por algo que el cliente ni siquiera terminó de
        // pedir, ni por un pedido que se anula antes de pagarse.
        const pedido = await tx.order.create({
          data: {
            businessId: ctx.business.id,
            code: (ultimo?.code ?? 0) + 1,
            businessDate,
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

      const nombre = producto.name;
      const precio = producto.priceCop;

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
          sentToKitchenAt: new Date(),
        },
      });

      if (settings.inventoryEnabled) {
        const recetas = await tx.productRecipeItem.findMany({
          where: { productId: producto.id },
        });
        for (const r of recetas) {
          const descuentoTotal = r.quantityRequired * input.quantity;
          const insumo = await tx.inventoryItem.findUnique({
            where: { id: r.inventoryItemId },
          });
          if (insumo) {
            const nuevoStock = insumo.stockCurrent - descuentoTotal;
            await tx.inventoryItem.update({
              where: { id: insumo.id },
              data: { stockCurrent: nuevoStock },
            });
            await tx.inventoryMovement.create({
              data: {
                businessId: ctx.business.id,
                inventoryItemId: insumo.id,
                type: "VENTA",
                quantity: -descuentoTotal,
                stockAfter: nuevoStock,
                unitCostCop: insumo.costCop,
                referenceId: pedido.id,
                notes: `Venta de ${producto.name} x${input.quantity}`,
              },
            });
          }
        }
      }

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

/**
 * La nota de un renglón: "sin cebolla", "extra queso", "bien cocido".
 *
 * No toca precio ni impuesto —es texto para la cocina, no un producto nuevo—,
 * así que no hace falta recalcular nada. Cualquiera de los que atienden puede
 * escribirla: es la forma barata de cubrir "adiciones y salsas" sin modelar un
 * sistema de modificadores con precio propio.
 */
export const ponerNotaItem = defineAction({
  schema: ponerNotaItemSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    const item = await db.orderItem.findFirst({
      where: { id: input.itemId },
      select: { id: true, orderId: true, status: true, order: { select: { status: true } } },
    });
    if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");
    if (item.status === "ANULADO") throw new ErrorDeUsuario("Ese renglón está anulado.");
    if (item.order.status === "PAGADA" || item.order.status === "ANULADA") {
      throw new ErrorDeUsuario("El pedido ya está cerrado.");
    }

    await db.orderItem.update({
      where: { id: item.id },
      data: { notes: input.notes ?? null },
    });

    revalidatePath(`/pedido/${item.orderId}`);
  },
});

/**
 * Saca un renglón mientras se está armando el pedido.
 *
 * No es una anulación: cocina todavía no vio el renglón como algo por preparar
 * —sigue PENDIENTE, nadie lo empezó—, así que no hace falta motivo ni queda en
 * la bitácora. Apenas cocina lo toma (EN_PREPARACION en adelante) sacarlo ya es
 * una anulación de verdad y pasa por `anularItem`, con motivo y solo para
 * quien cobra. Por eso lo puede tocar cualquiera de ATIENDEN: es parte de tomar
 * el pedido, no de facturarlo.
 */
export const quitarItem = defineAction({
  schema: quitarItemSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const orderId = await db.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: input.itemId },
        select: {
          id: true,
          orderId: true,
          quantity: true,
          status: true,
          productId: true,
          product: { select: { trackStock: true } },
          order: { select: { status: true } },
        },
      });
      if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");
      if (item.status !== "PENDIENTE") {
        throw new ErrorDeUsuario(
          "Cocina ya lo tomó: para sacarlo hay que anularlo con motivo.",
        );
      }
      if (item.order.status === "PAGADA" || item.order.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado.");
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: { status: "ANULADO", canceledAt: new Date(), canceledById: ctx.user.id },
      });

      if (item.product.trackStock) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
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
          type: true,
          turnNumber: true,
          businessDate: true,
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
        // El turno se reparte acá y no al abrir el pedido: es el momento en que
        // el cliente pagó de verdad y hay algo que preparar. Una mesa se llama
        // por su número, no por turno, y un pedido que ya tenía uno —porque esto
        // es el segundo pago de varios— no pide otro.
        const turnNumber =
          pedido.type !== "MESA" && pedido.turnNumber === null
            ? await siguienteTurnoLibre(tx, pedido.businessDate, settings.turnNumberMax)
            : undefined;

        await tx.order.update({
          where: { id: pedido.id },
          data: {
            status: "PAGADA",
            closedAt: new Date(),
            closedById: ctx.user.id,
            ...(turnNumber !== undefined ? { turnNumber } : {}),
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
  // El cajero entra acá porque un pedido VACÍO también se anula desde esta
  // acción, y ese caso es suyo. El chequeo fino está adentro.
  roles: COBRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: {
          id: true,
          code: true,
          status: true,
          totalCop: true,
          tableId: true,
          _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
        },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");

      // Primero el estado del pedido, después quién lo pide: si no, a un cajero
      // parado frente a un pedido ya pagado se le contesta "pedí un
      // administrador" y sale a buscarlo para que le digan lo mismo. El estado es
      // un hecho del pedido; el permiso, una cuestión de quién está mirando.
      if (pedido.status === "ANULADA") throw new ErrorDeUsuario("Ese pedido ya estaba anulado.");
      if (pedido.status === "PAGADA") {
        throw new ErrorDeUsuario(
          "Un pedido pagado no se anula: hay que registrar la devolución del pago.",
        );
      }

      // Anular un pedido CON consumo es una decisión que después se discute, y
      // la toma un administrador. Uno vacío es una mesa que se abrió por error:
      // si solo el administrador pudiera borrarla, el cajero no podría cerrar su
      // turno hasta que alguien apareciera.
      if (pedido._count.items > 0 && !tieneRol(ctx.role, [Role.ADMINISTRADOR])) {
        throw new ErrorDeUsuario(
          "Ese pedido tiene consumo: solo un administrador puede anularlo.",
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
