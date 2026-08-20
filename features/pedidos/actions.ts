"use server";

import { revalidatePath } from "next/cache";
import {
  AppModule,
  DeliveryStatus,
  OrderChannel,
  OrderType,
  Role,
} from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { sincronizarEstadoMesa } from "@/features/salon/estado-mesa";
import { cerrarComandaAlDespachar } from "@/features/domicilios/despacho";
import { avisarAlAgente } from "@/lib/printing/cola";
import { encolarComandas, encolarRecibo } from "@/lib/printing/emitir";
import { recalcularTotales } from "@/features/pedidos/totales";
import { modificadoresDeRenglon, resolverModificadores } from "@/features/pedidos/modificadores";
import { siguienteTurnoLibre } from "@/features/pedidos/turnos";
import {
  abrirPedidoSchema,
  agregarItemSchema,
  anularItemSchema,
  anularPedidoSchema,
  cambiarCantidadSchema,
  liberarMesaSchema,
  pagoSchema,
  pedidoSchema,
  pedirCuentaSchema,
  ponerNotaItemSchema,
  procesarVentaPosCompletaSchema,
  propinaSchema,
  quitarItemSchema,
  renombrarCuentaSchema,
} from "@/features/pedidos/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { describirAviso } from "@/lib/avisos";
import {
  publicarAviso,
  publishCocinaUpdate,
  publishDomiciliosUpdate,
  publishTurneroUpdate,
} from "@/lib/redis";
import { tieneRol } from "@/lib/auth/reglas";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { etiquetaDeCuenta } from "@/lib/salon/mesa";
import { computeTaxLine } from "@/lib/tax";
import { currentBusinessDate } from "@/lib/time";
import {
  ajustarStockCantidadReceta,
  auditarStockCarritoRecetas,
  restaurarStockReceta,
  verificarYDescontarStockReceta,
} from "@/lib/inventory/stock";

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
        // La etiqueta que va a llevar la cuenta. Con nombre es el nombre; sin
        // nombre, el ordinal dentro de la mesa.
        let customerName = input.customerName?.trim() || null;

        if (input.tableId) {
          const mesa = await tx.table.findFirst({
            where: { id: input.tableId, deletedAt: null },
            select: { id: true, name: true, status: true },
          });
          if (!mesa) throw new ErrorDeUsuario("Esa mesa no existe.");
          if (mesa.status === "INACTIVA") {
            throw new ErrorDeUsuario(`La mesa ${mesa.name} está fuera de servicio.`);
          }

          // Prevención de doble pedido: si se toca la mesa libre y ya existe una
          // cuenta abierta sin productos en esta misma mesa, se reutiliza en vez
          // de crear una segunda cuenta vacía por retrasos de red o doble clic.
          if (!customerName) {
            const ordenVaciaExistente = await tx.order.findFirst({
              where: {
                tableId: mesa.id,
                businessDate,
                status: "ABIERTA",
                items: { none: {} },
              },
              orderBy: { openedAt: "desc" },
              select: { id: true, code: true, turnNumber: true, tableId: true },
            });
            if (ordenVaciaExistente) {
              return ordenVaciaExistente;
            }

            const abiertasHoy = await tx.order.count({
              where: { tableId: mesa.id, businessDate },
            });
            customerName = etiquetaDeCuenta(null, abiertasHoy + 1);
          } else {
            // Si viene con nombre (ej. desde "+ Nueva cuenta"), prevenir doble envío idéntico en los últimos 15s
            const ordenMismoNombreReciente = await tx.order.findFirst({
              where: {
                tableId: mesa.id,
                businessDate,
                status: "ABIERTA",
                customerName,
                openedById: ctx.user.id,
                items: { none: {} },
                openedAt: { gte: new Date(Date.now() - 15_000) },
              },
              select: { id: true, code: true, turnNumber: true, tableId: true },
            });
            if (ordenMismoNombreReciente) {
              return ordenMismoNombreReciente;
            }
          }
        } else {
          // Para pedidos sin mesa: si el mismo usuario abrió un pedido vacío en los últimos 10 segundos, reutilizarlo
          const ordenSinMesaReciente = await tx.order.findFirst({
            where: {
              tableId: null,
              businessDate,
              status: "ABIERTA",
              openedById: ctx.user.id,
              items: { none: {} },
              openedAt: { gte: new Date(Date.now() - 10_000) },
            },
            orderBy: { openedAt: "desc" },
            select: { id: true, code: true, turnNumber: true, tableId: true },
          });
          if (ordenSinMesaReciente) {
            return ordenSinMesaReciente;
          }
        }

        const ultimo = await tx.order.findFirst({
          where: { businessDate },
          orderBy: { code: "desc" },
          select: { code: true },
        });

        const turnNumber =
          input.type !== "MESA"
            ? await siguienteTurnoLibre(tx, businessDate, settings.turnNumberMax)
            : null;

        const pedido = await tx.order.create({
          data: {
            businessId: ctx.business.id,
            code: (ultimo?.code ?? 0) + 1,
            turnNumber,
            businessDate,
            type: input.type,
            channel: input.type === "MESA" ? OrderChannel.MESERO : OrderChannel.POS,
            tableId: input.tableId ?? null,
            cashSessionId: caja?.id ?? null,
            guestsCount: input.guestsCount ?? null,
            customerName,
            customerPhone: input.customerPhone ?? null,
            deliveryAddress: input.deliveryAddress ?? null,
            deliveryFeeCop: input.type === "DOMICILIO" ? (settings.deliveryFeeCop ?? 0) : 0,
            // Un domicilio que carga el negocio nace CONFIRMADO: quien lo tomó
            // ya tiene la dirección delante. La confirmación existe para lo que
            // entra por el menú QR, que llega sin que nadie lo haya mirado.
            deliveryStatus:
              input.type === "DOMICILIO" ? DeliveryStatus.EN_PREPARACION : null,
            deliveryConfirmedAt: input.type === "DOMICILIO" ? new Date() : null,
            notes: input.notes ?? null,
            openedById: ctx.user.id,
          },
          select: { id: true, code: true, turnNumber: true, tableId: true },
        });

        await sincronizarEstadoMesa(tx, pedido.tableId);

        return pedido;
      }),
    ).then((pedido) => {
      // No se revalida ni el salón ni la pantalla de la mesa: de las dos nos
      // estamos yendo, las dos son `force-dynamic` y se rearman solas en la
      // próxima visita. Revalidar la pantalla que se abandona era justamente lo
      // que hacía perder el salto a la cuenta: el cuadro se repintaba como mesa
      // ocupada antes de que el efecto del cliente alcanzara a navegar, y el
      // pedido quedaba abierto en la base con la persona mirando el salón.
      //
      // Tampoco sirve `redirect()` desde acá, aunque parezca lo natural: deja la
      // transición de la acción a medio cerrar y la pantalla de destino no vuelve
      // a repintarse. En la práctica el mesero tocaba un producto, no veía
      // aparecer nada en la cuenta, volvía a tocar, y terminaba con seis.
      void publishTurneroUpdate(ctx.business.id);
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
          taxRate: { select: { rateBp: true, name: true, kind: true } },
        },
      });
      if (!producto || !producto.active) throw new ErrorDeUsuario("Ese producto no existe.");
      if (!producto.isAvailable) {
        throw new ErrorDeUsuario(`${producto.name} está marcado como agotado.`);
      }

      const nombre = producto.name;

      const { recargoCop, snapshots, opcionIds } = await resolverModificadores(
        tx,
        producto.id,
        producto.name,
        input.modifierOptionIds,
      );

      // El recargo se pliega dentro del precio unitario: de ahí para abajo todo
      // el cálculo de impuesto y de totales sigue viendo un solo número, igual
      // que antes de que existieran los modificadores.
      const precio = producto.priceCop + recargoCop;

      // Acá se congela todo: nombre, precio y tarifa. Un tiquete reimpreso en seis
      // meses tiene que salir idéntico aunque el producto haya cambiado de precio
      // o el negocio haya cambiado de régimen de impuesto.
      const linea = computeTaxLine({
        unitPriceCop: precio,
        quantity: input.quantity,
        taxRateBp: producto.taxRate.rateBp,
        taxIncluded: settings.pricesIncludeTax,
      });

      // El descuento va ANTES de escribir el renglón porque de acá sale el costo
      // que el renglón congela. Hacerlo después obligaría a un UPDATE extra por
      // cada producto de cada pedido para volver a escribir lo mismo.
      const { unitCostCop } = await verificarYDescontarStockReceta(
        tx,
        ctx.business.id,
        producto.id,
        input.quantity,
        {
          referenceId: pedido.id,
          inventoryEnabled: settings.inventoryEnabled,
          permitirVentaSinStock: settings.permitirVentaSinStock,
          modifierOptionIds: opcionIds,
        },
      );

      await tx.orderItem.create({
        data: {
          businessId: ctx.business.id,
          orderId: pedido.id,
          productId: producto.id,
          nameSnapshot: nombre,
          unitPriceCop: precio,
          basePriceCopSnapshot: producto.priceCop,
          taxRateBpSnapshot: producto.taxRate.rateBp,
          taxRateNameSnapshot: producto.taxRate.name,
          taxKindSnapshot: producto.taxRate.kind,
          taxIncludedSnapshot: settings.pricesIncludeTax,
          quantity: input.quantity,
          lineSubtotalCop: linea.lineSubtotalCop,
          lineTaxCop: linea.lineTaxCop,
          lineTotalCop: linea.lineTotalCop,
          unitCostCopSnapshot: unitCostCop,
          lineCostCop: unitCostCop === null ? null : unitCostCop * input.quantity,
          notes: input.notes ?? null,
          createdById: ctx.user.id,
          sentToKitchenAt: null,
          // Escritura anidada: `tenantDb` no inyecta el businessId acá adentro,
          // por eso va explícito en cada fila.
          modifiers: {
            create: snapshots.map((s) => ({ businessId: ctx.business.id, ...s })),
          },
        },
      });

      await recalcularTotales(tx, pedido.id);
    });

    revalidatePath(`/pedido/${input.orderId}`);
    revalidatePath("/salon");
    revalidatePath("/turnero");
    void publishTurneroUpdate(ctx.business.id);
  },
});

export const cambiarCantidad = defineAction({
  schema: cambiarCantidadSchema,
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
          unitPriceCop: true,
          basePriceCopSnapshot: true,
          taxRateBpSnapshot: true,
          taxRateNameSnapshot: true,
          taxKindSnapshot: true,
          taxIncludedSnapshot: true,
          nameSnapshot: true,
          notes: true,
          discountCop: true,
          status: true,
          sentToKitchenAt: true,
          productId: true,
          businessId: true,
          unitCostCopSnapshot: true,
          product: { select: { trackStock: true, name: true, active: true, isAvailable: true } },
          order: { select: { status: true } },
        },
      });
      if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");
      if (item.status === "ANULADO") throw new ErrorDeUsuario("Ese renglón está anulado.");
      if (item.order.status === "PAGADA" || item.order.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado.");
      }

      const settings = await getSettings(item.businessId);

      // Si el ítem ya fue enviado a cocina y se aumenta la cantidad,
      // se crea un nuevo renglón para la adición en estado PENDIENTE (sentToKitchenAt: null),
      // para que cocina reciba la comanda del plato adicional al confirmar.
      if (item.status !== "PENDIENTE" || item.order.status === "CUENTA_PEDIDA") {
        if (input.quantity > item.quantity) {
          const delta = input.quantity - item.quantity;

          // Este es el único camino que crea un renglón CLONANDO los snapshots de
          // otro, así que era también el único donde nadie volvía a mirar el
          // producto: se podían seguir sumando unidades de algo archivado o
          // marcado como agotado media hora antes.
          if (!item.product.active) throw new ErrorDeUsuario("Ese producto ya no existe.");
          if (!item.product.isAvailable) {
            throw new ErrorDeUsuario(`${item.product.name} está marcado como agotado.`);
          }

          const lineaDelta = computeTaxLine({
            unitPriceCop: item.unitPriceCop,
            quantity: delta,
            taxRateBp: item.taxRateBpSnapshot,
            taxIncluded: item.taxIncludedSnapshot,
            discountCop: 0,
          });

          // Obtener modificadores para clonarlos en la adición
          const modificadoresOriginales = await tx.orderItemModifier.findMany({
            where: { orderItemId: item.id },
            select: {
              optionId: true,
              groupNameSnapshot: true,
              optionNameSnapshot: true,
              priceDeltaCopSnapshot: true,
              sortOrder: true,
            },
          });

          const { unitCostCop } = await ajustarStockCantidadReceta(
            tx,
            item.businessId,
            item.productId,
            0,
            delta,
            {
              referenceId: item.orderId,
              inventoryEnabled: settings.inventoryEnabled,
              permitirVentaSinStock: settings.permitirVentaSinStock,
              modifierOptionIds: await modificadoresDeRenglon(tx, item.id),
            },
          );

          // El costo del tramo nuevo se mide ahora y no se hereda: la adición se
          // prepara con los insumos de hoy, que pueden costar otra cosa. Si el
          // inventario no supo decirlo, cae al del renglón original.
          const costoUnitario = unitCostCop ?? item.unitCostCopSnapshot;

          await tx.orderItem.create({
            data: {
              businessId: item.businessId,
              orderId: item.orderId,
              productId: item.productId,
              nameSnapshot: item.nameSnapshot,
              unitPriceCop: item.unitPriceCop,
              basePriceCopSnapshot: item.basePriceCopSnapshot,
              taxRateBpSnapshot: item.taxRateBpSnapshot,
              taxRateNameSnapshot: item.taxRateNameSnapshot,
              taxKindSnapshot: item.taxKindSnapshot,
              taxIncludedSnapshot: item.taxIncludedSnapshot,
              quantity: delta,
              lineSubtotalCop: lineaDelta.lineSubtotalCop,
              lineTaxCop: lineaDelta.lineTaxCop,
              lineTotalCop: lineaDelta.lineTotalCop,
              unitCostCopSnapshot: costoUnitario,
              lineCostCop: costoUnitario === null ? null : costoUnitario * delta,
              notes: item.notes,
              createdById: ctx.user.id,
              sentToKitchenAt: null,
              status: "PENDIENTE",
              modifiers: {
                create: modificadoresOriginales.map((m) => ({
                  businessId: item.businessId,
                  optionId: m.optionId,
                  groupNameSnapshot: m.groupNameSnapshot,
                  optionNameSnapshot: m.optionNameSnapshot,
                  priceDeltaCopSnapshot: m.priceDeltaCopSnapshot,
                  sortOrder: m.sortOrder,
                })),
              },
            },
          });

          await recalcularTotales(tx, item.orderId);
          return item.orderId;
        }
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
          // El costo unitario congelado no se toca —es el del momento en que se
          // agregó—, pero el de la línea sigue a la cantidad.
          lineCostCop:
            item.unitCostCopSnapshot === null ? null : item.unitCostCopSnapshot * input.quantity,
        },
      });

      await ajustarStockCantidadReceta(
        tx,
        item.businessId,
        item.productId,
        item.quantity,
        input.quantity,
        {
          referenceId: item.orderId,
          inventoryEnabled: settings.inventoryEnabled,
          permitirVentaSinStock: settings.permitirVentaSinStock,
          // Los mismos modificadores con los que se descontó. Sin esto, subir de
          // 1 a 2 un plato con carne descuenta el arroz de la receta base y no la
          // carne, y el inventario se va desviando renglón a renglón.
          modifierOptionIds: await modificadoresDeRenglon(tx, item.id),
        },
      );

      await recalcularTotales(tx, item.orderId);
      return item.orderId;
    });

    revalidatePath(`/pedido/${orderId}`);
    revalidatePath("/salon");
    revalidatePath("/caja");
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
  async handler({ input, db, ctx }) {
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
    revalidatePath("/cocina");
    void publishCocinaUpdate(ctx.business.id);
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
          businessId: true,
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

      const settings = await getSettings(item.businessId);
      await restaurarStockReceta(tx, item.businessId, item.productId, item.quantity, {
        referenceId: item.orderId,
        inventoryEnabled: settings.inventoryEnabled,
        customNotes: `Quitar renglón de producto x${item.quantity}`,
        modifierOptionIds: await modificadoresDeRenglon(tx, item.id),
      });

      await recalcularTotales(tx, item.orderId);
      return item.orderId;
    });

    revalidatePath(`/pedido/${orderId}`);
    revalidatePath("/salon");
    revalidatePath("/caja");
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
          businessId: true,
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

      const settings = await getSettings(item.businessId);
      await restaurarStockReceta(tx, item.businessId, item.productId, item.quantity, {
        referenceId: item.orderId,
        inventoryEnabled: settings.inventoryEnabled,
        customNotes: `Anulación de renglón ${item.nameSnapshot} x${item.quantity}. Motivo: ${input.motivo}`,
        modifierOptionIds: await modificadoresDeRenglon(tx, item.id),
      });

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
    revalidatePath("/salon");
    revalidatePath("/caja");
  },
});

export const pedirCuenta = defineAction({
  schema: pedirCuentaSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db, ctx }) {
    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, status: true, tableId: true, tipCop: true },
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
    if (pedido.status !== "ABIERTA") {
      throw new ErrorDeUsuario("La cuenta ya fue pedida o el pedido está cerrado.");
    }

    await db.$transaction(async (tx) => {
      /**
       * La propina se guarda en el mismo commit que manda la cuenta a caja.
       *
       * Es lo que hace que la pre-cuenta impresa muestre el total que de verdad
       * se va a cobrar: si se eligiera recién en la caja, el papel que el mesero
       * llevó a la mesa diría otra cosa.
       */
      if (input.tipCop !== undefined && input.tipCop !== pedido.tipCop) {
        await tx.order.update({
          where: { id: pedido.id },
          data: { tipCop: input.tipCop },
        });
        await recalcularTotales(tx, pedido.id);
      }

      await tx.order.update({
        where: { id: pedido.id },
        data: { status: "CUENTA_PEDIDA", billRequestedAt: new Date() },
      });
      await sincronizarEstadoMesa(tx, pedido.tableId);
    });

    revalidatePath("/salon");
    revalidatePath("/caja");
    revalidatePath("/turnero");
    revalidatePath(`/pedido/${pedido.id}`);
    void publishTurneroUpdate(ctx.business.id);
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
      /** Cuántos papeles quedaron en la cola: decide si hay que tocar el timbre. */
      let impresos = 0;

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
          tipCop: true,
          tableId: true,
          cashSessionId: true,
          deliveryStatus: true,
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

      /**
       * La propina se guarda ANTES del pago, para que el total contra el que se
       * mide el faltante ya la incluya.
       *
       * Viene en el mismo cobro y no de una acción aparte: una propina cargada
       * que después no se cobra deja el pedido con un total que nadie pagó. `0`
       * es válido y significa que la deseleccionaron.
       */
      if (input.tipCop !== undefined && input.tipCop !== pedido.tipCop) {
        await tx.order.update({
          where: { id: pedido.id },
          data: { tipCop: input.tipCop },
        });
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

      // Los datos para la factura electrónica viajan con el cobro, y se guardan
      // solo si el negocio de verdad puede emitir: el gate está acá y no solo en
      // la pantalla, porque una Server Action se alcanza por POST directo.
      if (input.facturaElectronica && puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada())) {
        await tx.order.update({
          where: { id: pedido.id },
          data: {
            docType: input.docType ?? null,
            docNumber: input.docNumber ?? null,
            customerEmail: input.customerEmail ?? null,
          },
        });
      }

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

        /**
         * Facturar un domicilio lo pone en reparto, sin que nadie lo toque.
         *
         * Es el paso que el cliente ve: hasta acá el rastreo del menú QR decía
         * "en preparación" y solo avanzaba si alguien iba al módulo de domicilios
         * a moverlo a mano. Ahora cobrar es despachar, que es lo que de verdad
         * pasa en el mostrador.
         */
        const despacha = pedido.deliveryStatus === "LISTO";

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
            ...(despacha
              ? { deliveryStatus: "EN_CAMINO" as const, dispatchedAt: new Date() }
              : {}),
          },
        });

        // La comida se la llevó el repartidor: sale de la pantalla de cocina.
        if (despacha) await cerrarComandaAlDespachar(tx, pedido.id);

        // El recibo se encola DENTRO de la transacción: encolarlo afuera podría
        // imprimir el papel de una venta que después no se guardó.
        impresos += await encolarRecibo(tx, ctx.business.id, pedido.id);
        // La mesa no se libera por haber cobrado ESTA cuenta: se libera cuando no
        // le queda ninguna abierta. Con cuentas separadas, cobrarle a uno de tres
        // dejaba la mesa libre con los otros dos todavía sentados.
        await sincronizarEstadoMesa(tx, pedido.tableId);
      }

      return {
        cerrado,
        faltanteCop: Math.max(0, faltante),
        changeCop,
        totales,
        tableId: pedido.tableId,
        esDomicilio: pedido.deliveryStatus !== null,
        impresos,
      };
    });

    revalidatePath("/salon");
    revalidatePath("/caja");
    revalidatePath("/turnero");
    revalidatePath("/cocina");
    revalidatePath(`/pedido/${input.orderId}`);
    void publishCocinaUpdate(ctx.business.id);
    void publishTurneroUpdate(ctx.business.id);

    // Sin esto el panel de domicilios se queda mostrando el pedido en la caja y
    // el rastreo del comensal no se entera de que su comida salió.
    if (resultado.esDomicilio) {
      revalidatePath("/domicilios");
      void publishDomiciliosUpdate(ctx.business.id);
    }

    // El timbre va DESPUÉS del commit: antes, el agente podría venir a buscar un
    // trabajo que todavía no existe y no volvería hasta su próxima ronda.
    if (resultado.impresos > 0) avisarAlAgente(ctx.business.id);

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

      const itemsParaDevolver = await tx.orderItem.findMany({
        where: { orderId: pedido.id, status: { not: "ANULADO" } },
        select: {
          id: true,
          productId: true,
          quantity: true,
          nameSnapshot: true,
          modifiers: { select: { optionId: true } },
        },
      });

      const settings = await getSettings(ctx.business.id);
      for (const item of itemsParaDevolver) {
        await restaurarStockReceta(tx, ctx.business.id, item.productId, item.quantity, {
          referenceId: pedido.id,
          inventoryEnabled: settings.inventoryEnabled,
          customNotes: `Anulación de pedido #${pedido.code}. Motivo: ${input.motivo}`,
          modifierOptionIds: item.modifiers
            .map((m) => m.optionId)
            .filter((id): id is string => id !== null),
        });
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

      await sincronizarEstadoMesa(tx, pedido.tableId);

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
    revalidatePath("/caja");
    revalidatePath(`/pedido/${input.orderId}`);
  },
});

/**
 * Cierra una cuenta en la que nadie pidió nada.
 *
 * Es el agujero que dejaba mesas y pedidos abiertos para siempre: una mesa que se
 * abrió por error, o un "Nuevo pedido" para llevar que quedó sin productos, no
 * tenía salida. Cobrar era imposible —`pagoSchema` exige un monto mayor a cero—,
 * caja no los listaba —`getCuentasPorCobrar` pide al menos un renglón— y anular
 * exigía rol de caja y un motivo escrito, así que el mesero que la abrió no podía
 * deshacerla. Y mientras tanto `cerrarCaja` se negaba a cerrar el turno.
 *
 * No pide motivo a propósito: "se abrió por error" no es una decisión que alguien
 * vaya a discutir después, y obligar a escribirlo era justamente lo que hacía que
 * nadie lo hiciera. Queda en la bitácora igual, con quién y cuándo.
 */
export const cerrarSinConsumo = defineAction({
  schema: pedidoSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: {
          id: true,
          code: true,
          status: true,
          tableId: true,
          customerName: true,
          _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
        },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (pedido.status === "PAGADA") throw new ErrorDeUsuario("Ese pedido ya está pagado.");
      if (pedido.status === "ANULADA") throw new ErrorDeUsuario("Ese pedido ya estaba cerrado.");
      if (pedido._count.items > 0) {
        throw new ErrorDeUsuario(
          "Esa cuenta tiene consumo: hay que cobrarla, o anularla con motivo.",
        );
      }

      await tx.order.update({
        where: { id: pedido.id },
        data: {
          status: "ANULADA",
          canceledAt: new Date(),
          canceledById: ctx.user.id,
          canceledReason: "Sin consumo",
        },
      });

      await sincronizarEstadoMesa(tx, pedido.tableId);

      await tx.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "pedido.cerrar-sin-consumo",
          entity: "Order",
          entityId: pedido.id,
          metadata: { pedido: pedido.code, cuenta: pedido.customerName },
        },
      });

    });

    revalidatePath("/salon");
    revalidatePath("/pos");
    revalidatePath("/caja");
    revalidatePath(`/pedido/${input.orderId}`);
  },
});

/**
 * Cierra de una todas las cuentas vacías de una mesa.
 *
 * Sin esto, una mesa que se abrió por error con tres cuentas obliga a entrar a
 * cada una para cerrarla. Si alguna tiene consumo no se cierra nada: la mesa se
 * libera entera o no se libera, porque cerrar la mitad deja al mesero creyendo
 * que ya está y a la mesa todavía ocupada.
 */
export const liberarMesa = defineAction({
  schema: liberarMesaSchema,
  roles: ATIENDEN,
  modulo: AppModule.MESAS,
  async handler({ input, ctx, db }) {
    const cerradas = await db.$transaction(async (tx) => {
      const mesa = await tx.table.findFirst({
        where: { id: input.tableId, deletedAt: null },
        select: {
          id: true,
          name: true,
          orders: {
            where: { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
            orderBy: { openedAt: "asc" },
            select: {
              id: true,
              code: true,
              customerName: true,
              _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
            },
          },
        },
      });
      if (!mesa) throw new ErrorDeUsuario("Esa mesa no existe.");
      if (mesa.orders.length === 0) {
        throw new ErrorDeUsuario(`La mesa ${mesa.name} ya está libre.`);
      }

      const conConsumo = mesa.orders.filter((o) => o._count.items > 0);
      if (conConsumo.length > 0) {
        const nombres = conConsumo
          .map((o, i) => etiquetaDeCuenta(o.customerName, i + 1))
          .join(", ");
        throw new ErrorDeUsuario(
          conConsumo.length === 1
            ? `La cuenta de ${nombres} tiene consumo: cobrala antes de liberar la mesa.`
            : `Estas cuentas tienen consumo: ${nombres}. Cobralas antes de liberar la mesa.`,
        );
      }

      const ahora = new Date();
      await tx.order.updateMany({
        where: { id: { in: mesa.orders.map((o) => o.id) } },
        data: {
          status: "ANULADA",
          canceledAt: ahora,
          canceledById: ctx.user.id,
          canceledReason: "Sin consumo",
        },
      });

      await sincronizarEstadoMesa(tx, mesa.id);

      await tx.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "mesa.liberar-sin-consumo",
          entity: "Table",
          entityId: mesa.id,
          metadata: { mesa: mesa.name, cuentas: mesa.orders.map((o) => o.code) },
        },
      });

      return mesa.orders.length;
    });

    revalidatePath("/salon");
    revalidatePath("/caja");
    return { cerradas };
  },
});

/**
 * Le pone nombre a una cuenta: "Andrés", "Camila".
 *
 * Es lo único que distingue las cuentas de una misma mesa en el salón, en la
 * comanda que sale a cocina y en el tiquete. No es un dato fiscal: a quién se le
 * factura se decide al cobrar, y sin documento la venta va a consumidor final.
 */
export const renombrarCuenta = defineAction({
  schema: renombrarCuentaSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, status: true, tableId: true },
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
    if (pedido.status === "PAGADA" || pedido.status === "ANULADA") {
      throw new ErrorDeUsuario("El pedido ya está cerrado.");
    }

    await db.order.update({
      where: { id: pedido.id },
      data: { customerName: input.customerName ?? null },
    });

    revalidatePath("/salon");
    revalidatePath("/cocina");
    revalidatePath("/caja");
    revalidatePath(`/pedido/${pedido.id}`);
    void publishCocinaUpdate(ctx.business.id);
  },
});

export const confirmarPedido = defineAction({
  schema: pedidoSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);

    const resultado = await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: {
          id: true,
          code: true,
          type: true,
          turnNumber: true,
          businessDate: true,
          status: true,
          // Para el aviso que salta en las demás pantallas. Se piden acá, dentro
          // de la consulta que igual se hace, y no en un viaje aparte después.
          customerName: true,
          table: { select: { name: true } },
          items: {
            where: { status: { not: "ANULADO" } },
            select: { id: true, status: true, sentToKitchenAt: true },
          },
        },
      });

      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (pedido.status === "PAGADA" || pedido.status === "ANULADA") {
        throw new ErrorDeUsuario("El pedido ya está cerrado.");
      }
      if (pedido.items.length === 0) {
        throw new ErrorDeUsuario(
          "El pedido no tiene productos. Agregá productos a la comanda antes de enviarla a cocina.",
        );
      }

      let turnNumber = pedido.turnNumber;
      if (turnNumber === null) {
        turnNumber = await siguienteTurnoLibre(tx, pedido.businessDate, settings.turnNumberMax);
      }

      const ahora = new Date();
      const itemsPendientes = pedido.items.filter(
        (i) => i.status === "PENDIENTE" && i.sentToKitchenAt === null,
      );

      // Si el pedido estaba en CUENTA_PEDIDA y se adicionaron platos, regresa a ABIERTA
      const nuevoStatus = pedido.status === "CUENTA_PEDIDA" ? "ABIERTA" : pedido.status;

      await tx.order.update({
        where: { id: pedido.id },
        data: {
          turnNumber,
          status: nuevoStatus,
          items: {
            updateMany: {
              where: { status: "PENDIENTE", sentToKitchenAt: null },
              data: { sentToKitchenAt: ahora },
            },
          },
        },
      });

      const cantNuevos = itemsPendientes.length > 0 ? itemsPendientes.length : pedido.items.length;

      // Solo lo que se acaba de mandar: agregar un plato a una mesa no puede
      // reimprimir el pedido entero.
      const impresos = await encolarComandas(tx, ctx.business.id, pedido.id, ahora);

      return {
        impresos,
        turnNumber,
        aviso: describirAviso({
          tipo: "COCINA_NUEVA_COMANDA",
          orderId: pedido.id,
          code: pedido.code,
          mesa: pedido.table?.name ?? null,
          cuenta: pedido.customerName,
          turno: turnNumber,
          productos: cantNuevos,
        }),
      };
    });

    revalidatePath("/salon");
    revalidatePath("/cocina");
    revalidatePath("/turnero");
    revalidatePath(`/pedido/${input.orderId}`);
    void publishCocinaUpdate(ctx.business.id);
    void publishTurneroUpdate(ctx.business.id);
    // Este es el momento canónico en que un pedido llega a la cocina, y por eso
    // acá sí se levanta un aviso: los otros `publishCocinaUpdate` del archivo
    // —una nota, un renombre, un cobro— mueven el contador y nada más.
    void publicarAviso(ctx.business.id, resultado.aviso);
    if (resultado.impresos > 0) avisarAlAgente(ctx.business.id);

    return { turnNumber: resultado.turnNumber };
  },
});

export const procesarVentaPosCompleta = defineAction({
  schema: procesarVentaPosCompletaSchema,
  roles: ATIENDEN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    if (!input.customerName || !input.customerName.trim()) {
      throw new ErrorDeUsuario("El nombre del cliente es obligatorio para facturar e imprimir.");
    }

    const settings = await getSettings(ctx.business.id);
    const businessDate = currentBusinessDate(settings);

    const caja = await db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true },
    });
    if (settings.requireOpenCashSession && !caja) {
      throw new ErrorDeUsuario(
        "No hay caja abierta. Abrí el turno antes de tomar pedidos.",
      );
    }

    // Los datos de la factura electrónica solo se guardan si el negocio de verdad
    // puede emitir: el gate va acá y no solo en la pantalla, porque una Server
    // Action se alcanza por POST directo sin pasar por la interfaz.
    const datosFiscales =
      input.facturaElectronica && puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada())
        ? {
            docType: input.docType ?? null,
            docNumber: input.docNumber ?? null,
            customerEmail: input.customerEmail ?? null,
          }
        : {};

    const resultado = await conReintento(() =>
      db.$transaction(async (tx) => {
        const ahora = new Date();
        const debeEnviarACocina = input.accion === "ENVIAR_COCINA" || input.accion === "PAGAR_DIRECTO";

        let pedido: {
          id: string;
          code: number;
          turnNumber: number | null;
          tableId: string | null;
          table: { name: string } | null;
        };

        if (input.orderId) {
          const existente = await tx.order.findFirst({
            where: { id: input.orderId },
            select: {
              id: true,
              code: true,
              turnNumber: true,
              status: true,
              deliveryStatus: true,
            },
          });
          if (!existente) throw new ErrorDeUsuario("Ese pedido no existe.");
          if (existente.status === "PAGADA" || existente.status === "ANULADA") {
            throw new ErrorDeUsuario("El pedido ya está cerrado.");
          }

          let turnNumber = existente.turnNumber;
          if (turnNumber === null && debeEnviarACocina) {
            turnNumber = await siguienteTurnoLibre(tx, businessDate, settings.turnNumberMax);
          }

          pedido = await tx.order.update({
            where: { id: existente.id },
            data: {
              turnNumber,
              type: input.type,
              customerName: input.customerName ?? null,
              customerPhone: input.customerPhone ?? null,
              deliveryAddress: input.deliveryAddress ?? null,
              deliveryFeeCop: input.type === "DOMICILIO" ? (settings.deliveryFeeCop ?? 0) : 0,
              /**
               * Un pedido parqueado que recién ahora se marca como domicilio
               * arranca su recorrido; uno que ya lo era, no se toca.
               *
               * Reescribirlo siempre mandaría para atrás a uno que la cocina ya
               * terminó, y le borraría al cliente el "en reparto" que estaba
               * viendo.
               */
              ...(input.type === "DOMICILIO" && existente.deliveryStatus === null
                ? {
                    deliveryStatus: DeliveryStatus.EN_PREPARACION,
                    deliveryConfirmedAt: ahora,
                  }
                : {}),
              notes: input.notes ?? null,
              ...datosFiscales,
            },
            select: {
              id: true,
              code: true,
              turnNumber: true,
              tableId: true,
              // Para el aviso: un pedido parqueado puede traer mesa, aunque el
              // POS casi siempre trabaje sin ella.
              table: { select: { name: true } },
            },
          });

          // Este camino borra y recrea todos los renglones en vez de calcular un
          // diff. Los renglones que se borran ya habían descontado su stock al
          // parquear el pedido, así que hay que devolverlo antes: los que sigan
          // en el carrito se vuelven a descontar más abajo. Sin esto, parquear y
          // reabrir un pedido descuenta los insumos dos veces.
          const itemsPrevios = await tx.orderItem.findMany({
            where: { orderId: pedido.id, status: { not: "ANULADO" } },
            select: {
              productId: true,
              quantity: true,
              modifiers: { select: { optionId: true } },
            },
          });

          for (const previo of itemsPrevios) {
            await restaurarStockReceta(tx, ctx.business.id, previo.productId, previo.quantity, {
              referenceId: pedido.id,
              inventoryEnabled: settings.inventoryEnabled,
              customNotes: `Reapertura de pedido #${pedido.code}: se rearma el consumo`,
              modifierOptionIds: previo.modifiers
                .map((m) => m.optionId)
                .filter((id): id is string => id !== null),
            });
          }

          await tx.orderItem.deleteMany({
            where: { orderId: pedido.id, status: { not: "ANULADO" } },
          });
        } else {
          const ultimo = await tx.order.findFirst({
            where: { businessDate },
            orderBy: { code: "desc" },
            select: { code: true },
          });

          const turnNumber = await siguienteTurnoLibre(tx, businessDate, settings.turnNumberMax);

          pedido = await tx.order.create({
            data: {
              businessId: ctx.business.id,
              code: (ultimo?.code ?? 0) + 1,
              turnNumber,
              businessDate,
              type: input.type,
              channel: OrderChannel.POS,
              cashSessionId: caja?.id ?? null,
              customerName: input.customerName ?? null,
              customerPhone: input.customerPhone ?? null,
              deliveryAddress: input.deliveryAddress ?? null,
              deliveryFeeCop: input.type === "DOMICILIO" ? (settings.deliveryFeeCop ?? 0) : 0,
              // El domicilio que carga el negocio nace CONFIRMADO: quien lo tomó
              // ya tiene la dirección delante. La confirmación existe para lo que
              // entra por el menú QR, que llega sin que nadie lo haya mirado.
              deliveryStatus:
                input.type === "DOMICILIO" ? DeliveryStatus.EN_PREPARACION : null,
              deliveryConfirmedAt: input.type === "DOMICILIO" ? ahora : null,
              notes: input.notes ?? null,
              ...datosFiscales,
              openedById: ctx.user.id,
            },
            select: {
              id: true,
              code: true,
              turnNumber: true,
              tableId: true,
              // Para el aviso: un pedido parqueado puede traer mesa, aunque el
              // POS casi siempre trabaje sin ella.
              table: { select: { name: true } },
            },
          });
        }

        // Pre-verificación acumulada para todo el lote, antes de escribir nada:
        // tres platos que comparten la misma salsa se revisan juntos, porque
        // renglón por renglón cada uno pasa y el pedido entero igual no se puede
        // preparar. Usa la misma función pura que audita el carrito en el
        // navegador —antes esto era una copia a mano que había que mantener dos
        // veces— alimentada con las opciones que se eligieron en cada renglón.
        {
          const productos = await tx.product.findMany({
            where: { id: { in: input.items.map((i) => i.productId) }, deletedAt: null },
            select: {
              id: true,
              name: true,
              trackStock: true,
              stockQty: true,
              hasRecipe: true,
              recipeItems: {
                include: {
                  inventoryItem: {
                    select: { id: true, name: true, unit: true, stockCurrent: true },
                  },
                },
              },
            },
          });

          const idsDeOpciones = [...new Set(input.items.flatMap((i) => i.modifierOptionIds))];
          const opciones =
            idsDeOpciones.length === 0
              ? []
              : await tx.modifierOption.findMany({
                  where: { id: { in: idsDeOpciones } },
                  select: {
                    id: true,
                    name: true,
                    supplies: {
                      select: {
                        quantityRequired: true,
                        inventoryItem: {
                          select: { id: true, name: true, unit: true, stockCurrent: true },
                        },
                      },
                    },
                  },
                });
          const opcionPorId = new Map(opciones.map((o) => [o.id, o]));

          const problema = auditarStockCarritoRecetas(
            input.items.map((i) => ({
              productId: i.productId,
              name: "",
              quantity: i.quantity,
              opciones: i.modifierOptionIds
                .map((id) => opcionPorId.get(id))
                .filter((o) => o !== undefined),
            })),
            [{ products: productos }],
            settings.inventoryEnabled && !settings.permitirVentaSinStock,
          );
          if (problema) throw new ErrorDeUsuario(problema);
        }

        // 3. Crear Ítems (todos agrupados en el mismo lote de comanda)
        for (const itemInput of input.items) {
          const producto = await tx.product.findFirst({
            where: { id: itemInput.productId, deletedAt: null },
            select: {
              id: true,
              name: true,
              priceCop: true,
              isAvailable: true,
              active: true,
              taxRate: { select: { rateBp: true, name: true, kind: true } },
            },
          });

          if (!producto || !producto.active) {
            throw new ErrorDeUsuario("Ese producto no existe.");
          }
          if (!producto.isAvailable) {
            throw new ErrorDeUsuario(`"${producto.name}" está marcado como agotado.`);
          }

          const { recargoCop, snapshots, opcionIds } = await resolverModificadores(
            tx,
            producto.id,
            producto.name,
            itemInput.modifierOptionIds,
          );

          const precio = producto.priceCop + recargoCop;

          const linea = computeTaxLine({
            unitPriceCop: precio,
            quantity: itemInput.quantity,
            taxRateBp: producto.taxRate.rateBp,
            taxIncluded: settings.pricesIncludeTax,
          });

          // El descuento va antes de escribir el renglón: de ahí sale el costo
          // que se congela, y hacerlo después costaría un UPDATE extra por cada
          // producto de cada venta.
          const { unitCostCop } = await verificarYDescontarStockReceta(
            tx,
            ctx.business.id,
            producto.id,
            itemInput.quantity,
            {
              referenceId: pedido.id,
              inventoryEnabled: settings.inventoryEnabled,
              permitirVentaSinStock: settings.permitirVentaSinStock,
              modifierOptionIds: opcionIds,
            },
          );

          await tx.orderItem.create({
            data: {
              businessId: ctx.business.id,
              orderId: pedido.id,
              productId: producto.id,
              nameSnapshot: producto.name,
              unitPriceCop: precio,
              basePriceCopSnapshot: producto.priceCop,
              taxRateBpSnapshot: producto.taxRate.rateBp,
              taxRateNameSnapshot: producto.taxRate.name,
              taxKindSnapshot: producto.taxRate.kind,
              taxIncludedSnapshot: settings.pricesIncludeTax,
              quantity: itemInput.quantity,
              lineSubtotalCop: linea.lineSubtotalCop,
              lineTaxCop: linea.lineTaxCop,
              lineTotalCop: linea.lineTotalCop,
              unitCostCopSnapshot: unitCostCop,
              lineCostCop: unitCostCop === null ? null : unitCostCop * itemInput.quantity,
              notes: itemInput.notes ?? null,
              createdById: ctx.user.id,
              sentToKitchenAt: debeEnviarACocina ? ahora : null,
              modifiers: {
                create: snapshots.map((s) => ({ businessId: ctx.business.id, ...s })),
              },
            },
          });
        }

        // 4. Recalcular totales del pedido
        await recalcularTotales(tx, pedido.id);

        // 5. Si la acción es PAGAR_DIRECTO
        if (input.accion === "PAGAR_DIRECTO") {
          if (!tieneRol(ctx.role, COBRAN)) {
            throw new ErrorDeUsuario("Solo un cajero o administrador puede registrar cobros.");
          }
          const p = input.pago;
          if (!p) throw new ErrorDeUsuario("Faltan los datos del pago.");

          // La propina va antes de recalcular, para que el total ya la incluya.
          if (p.tipCop !== undefined && p.tipCop > 0) {
            await tx.order.update({
              where: { id: pedido.id },
              data: { tipCop: p.tipCop },
            });
            await recalcularTotales(tx, pedido.id);
          }

          const pActualizado = await tx.order.findUniqueOrThrow({
            where: { id: pedido.id },
            select: { totalCop: true, paidCop: true, cashSessionId: true },
          });

          const amountCop = p.amountCop > 0 ? p.amountCop : pActualizado.totalCop;
          const tenderedCop = p.tenderedCop ?? null;
          const changeCop =
            tenderedCop !== null && tenderedCop > amountCop ? tenderedCop - amountCop : null;

          await tx.orderPayment.create({
            data: {
              businessId: ctx.business.id,
              orderId: pedido.id,
              cashSessionId: caja?.id ?? null,
              method: p.method,
              amountCop,
              tenderedCop,
              changeCop,
              reference: p.reference ?? null,
              receivedById: ctx.user.id,
            },
          });

          const totales = await recalcularTotales(tx, pedido.id);
          const faltante = totales.totalCop - totales.paidCop;
          const huboEfectivo = p.method === "EFECTIVO";
          const cerrado =
            faltante <= 0 || (huboEfectivo && faltante > 0 && faltante < settings.cashRoundingCop);

          if (cerrado) {
            await tx.order.update({
              where: { id: pedido.id },
              data: {
                status: "PAGADA",
                closedAt: new Date(),
                // Este camino cerraba a medias: sin quién cobró y, si el pedido
                // se había abierto sin caja, sin colgarse de la que sí lo cobró
                // —o sea, fuera del arqueo—. `registrarPago` ya hacía las dos
                // cosas; acá faltaban.
                closedById: ctx.user.id,
                cashSessionId: pActualizado.cashSessionId ?? caja?.id ?? null,
              },
            });
            await sincronizarEstadoMesa(tx, pedido.tableId);
          }
        }

        /**
         * El papel, al final y dentro de la misma transacción.
         *
         * La comanda solo si de verdad se mandó a cocina; el recibo solo si la
         * venta quedó cerrada. Este camino borra y recrea los renglones, así que
         * `ahora` alcanza para acotar la comanda a lo que se acaba de enviar.
         */
        let impresos = 0;
        if (debeEnviarACocina) {
          impresos += await encolarComandas(tx, ctx.business.id, pedido.id, ahora);
        }
        if (input.accion === "PAGAR_DIRECTO") {
          impresos += await encolarRecibo(tx, ctx.business.id, pedido.id);
        }

        return {
          orderId: pedido.id,
          code: pedido.code,
          turnNumber: pedido.turnNumber,
          tableId: pedido.tableId,
          mesa: pedido.table?.name ?? null,
          pagado: input.accion === "PAGAR_DIRECTO",
          impresos,
        };
      }),
    );

    const debeEnviarACocinaNotificacion =
      input.accion === "ENVIAR_COCINA" || input.accion === "PAGAR_DIRECTO";

    if (resultado.impresos > 0) avisarAlAgente(ctx.business.id);

    revalidatePath("/pos");
    revalidatePath("/caja");
    revalidatePath("/salon");
    if (debeEnviarACocinaNotificacion) {
      revalidatePath("/cocina");
      revalidatePath("/turnero");
      void publishCocinaUpdate(ctx.business.id);
      void publishTurneroUpdate(ctx.business.id);
      // Los renglones que van a cocina son los del carrito: este camino borra y
      // recrea todos los del pedido, así que `input.items` es exactamente lo que
      // la cocina va a ver.
      void publicarAviso(
        ctx.business.id,
        describirAviso({
          tipo: "COCINA_NUEVA_COMANDA",
          orderId: resultado.orderId,
          code: resultado.code,
          mesa: resultado.mesa,
          cuenta: input.customerName ?? null,
          turno: resultado.turnNumber,
          productos: input.items.length,
        }),
      );
    }

    // Un domicilio tomado por el POS nunca avisaba al panel de domicilios: se
    // publicaba en cocina y en el turnero, pero no en su propio canal, así que
    // aparecía recién cuando alguien recargaba. El aviso sale solo la primera
    // vez —volver a parquear el mismo pedido no es un domicilio nuevo—.
    if (input.type === OrderType.DOMICILIO) {
      revalidatePath("/domicilios");
      void publishDomiciliosUpdate(ctx.business.id);

      if (!input.orderId) {
        void publicarAviso(
          ctx.business.id,
          describirAviso({
            tipo: "DOMICILIO_NUEVO",
            orderId: resultado.orderId,
            code: resultado.code,
            cliente: input.customerName ?? null,
            direccion: input.deliveryAddress ?? null,
            productos: input.items.length,
          }),
        );
      }
    }

    return resultado;
  },
});
