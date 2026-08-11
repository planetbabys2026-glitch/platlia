"use server";

import { OrderChannel, OrderItemStatus, OrderStatus, OrderType } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { crearPedidoClienteQRSchema, type CrearPedidoClienteQRInput } from "@/features/pedidos/qr-schemas";
import { publishCocinaUpdate, publishDomiciliosUpdate, publishTurneroUpdate } from "@/lib/redis";
// eslint-disable-next-line no-restricted-imports -- Acción pública del menú QR para resolver el negocio por su slug público
import { rootDb } from "@/lib/db/root";
import { tenantDb } from "@/lib/db/tenant";
import { computeTaxLine } from "@/lib/tax";
import { currentBusinessDate } from "@/lib/time";
import { siguienteTurnoLibre } from "@/features/pedidos/turnos";
import { verificarYDescontarStockReceta } from "@/lib/inventory/stock";

export async function crearPedidoClienteQR(rawInput: CrearPedidoClienteQRInput) {
  try {
    const input = crearPedidoClienteQRSchema.parse(rawInput);

    if (input.type === "DOMICILIO") {
      if (!input.customerPhone?.trim()) {
        return { ok: false, error: "El celular es obligatorio para pedidos a domicilio." };
      }
      if (!input.customerAddress?.trim()) {
        return { ok: false, error: "La dirección de entrega es obligatoria para pedidos a domicilio." };
      }
    }

    // 1. Buscar negocio por slug
    const business = await rootDb.business.findFirst({
      where: { slug: input.businessSlug, status: "ACTIVO", deletedAt: null },
      select: { id: true, name: true, slug: true },
    });

    if (!business) {
      return { ok: false, error: "Este establecimiento no está disponible o fue suspendido." };
    }

    const settings = await getSettings(business.id);

    if (!settings.qrMenuEnabled) {
      return { ok: false, error: "El menú digital QR no está activado para este negocio." };
    }

    const businessDate = currentBusinessDate(settings);
    const db = tenantDb(business.id);

    const resultado = await db.$transaction(async (tx) => {
      // 2. Consecutivo del pedido
      const ultimo = await tx.order.findFirst({
        where: { businessDate },
        orderBy: { code: "desc" },
        select: { code: true },
      });
      const code = (ultimo?.code ?? 0) + 1;

      // 3. Turno asignado para el pedido
      const turnNumber = await siguienteTurnoLibre(tx, businessDate, settings.turnNumberMax);

      // 4. Si es pedido por mesa, verificar mesa si viene id
      let tableId: string | null = null;
      if (input.type === "MESA" && input.tableId) {
        const mesa = await tx.table.findFirst({
          where: { id: input.tableId },
          select: { id: true },
        });
        if (mesa) tableId = mesa.id;
      }

      // Buscar usuario bot/sistema o primer miembro para openedById
      const primerMiembro = await tx.membership.findFirst({
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      });

      if (!primerMiembro) {
        throw new Error("El negocio no tiene personal asignado.");
      }

      // 5. Crear cabecera del pedido
      const channel = input.type === "DOMICILIO" ? OrderChannel.DOMICILIO_QR : OrderChannel.MESA_QR;

      const order = await tx.order.create({
        data: {
          businessId: business.id,
          code,
          type: input.type as OrderType,
          channel,
          status: OrderStatus.ABIERTA,
          businessDate,
          openedAt: new Date(),
          openedById: primerMiembro.userId,
          turnNumber,
          tableId,
          customerName: input.customerName || (input.tableName ? `Mesa: ${input.tableName}` : "Cliente QR"),
          customerPhone: input.customerPhone ?? null,
          deliveryAddress: input.customerAddress ?? null,
          docType: input.docType ?? null,
          docNumber: input.docNumber ?? null,
          deliveryStatus: "PENDIENTE",
          notes: input.customerAddress ? `Domicilio: ${input.customerAddress}` : null,
          subtotalCop: 0,
          taxCop: 0,
          totalCop: 0,
        },
      });

      // 6. Insertar renglones de producto
      let totalSubtotal = 0;
      let totalTax = 0;
      let totalTotal = 0;

      for (const itemInput of input.items) {
        const producto = await tx.product.findFirst({
          where: { id: itemInput.productId, deletedAt: null, active: true, isAvailable: true },
          select: {
            id: true,
            name: true,
            priceCop: true,
            taxRate: { select: { rateBp: true, name: true } },
          },
        });

        if (!producto) continue;

        const linea = computeTaxLine({
          unitPriceCop: producto.priceCop,
          quantity: itemInput.quantity,
          taxRateBp: producto.taxRate.rateBp,
          taxIncluded: settings.pricesIncludeTax,
        });

        totalSubtotal += linea.lineSubtotalCop;
        totalTax += linea.lineTaxCop;
        totalTotal += linea.lineTotalCop;

        await tx.orderItem.create({
          data: {
            businessId: business.id,
            orderId: order.id,
            productId: producto.id,
            nameSnapshot: producto.name,
            unitPriceCop: producto.priceCop,
            taxRateBpSnapshot: producto.taxRate.rateBp,
            taxRateNameSnapshot: producto.taxRate.name,
            taxIncludedSnapshot: settings.pricesIncludeTax,
            quantity: itemInput.quantity,
            lineSubtotalCop: linea.lineSubtotalCop,
            lineTaxCop: linea.lineTaxCop,
            lineTotalCop: linea.lineTotalCop,
            notes: itemInput.notes ?? null,
            createdById: primerMiembro.userId,
            status: OrderItemStatus.PENDIENTE,
            sentToKitchenAt: new Date(), // ¡El cliente envía el pedido directo a cocina!
          },
        });

        await verificarYDescontarStockReceta(tx, business.id, producto.id, itemInput.quantity, {
          referenceId: order.id,
          inventoryEnabled: settings.inventoryEnabled,
          customNotes: `Pedido Menú QR x${itemInput.quantity}`,
        });
      }

      // 7. Actualizar totales del pedido
      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotalCop: totalSubtotal,
          taxCop: totalTax,
          totalCop: totalTotal,
        },
      });

      // Si se asignó mesa, marcar mesa como OCUPADA
      if (tableId) {
        await tx.table.update({
          where: { id: tableId },
          data: { status: "OCUPADA" },
        });
      }

      return {
        orderId: order.id,
        code: order.code,
        turnNumber,
        type: order.type,
        totalCop: totalTotal,
      };
    });

    // Notificar a cocina, turnero y domicilios vía SSE/Redis
    void publishCocinaUpdate(business.id);
    void publishTurneroUpdate(business.id);
    void publishDomiciliosUpdate(business.id);

    return { ok: true, data: resultado };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Ocurrió un error al procesar tu pedido.";
    return { ok: false, error: errorMsg };
  }
}

export async function consultarEstadoPedidoQR(businessSlug: string, query: string) {
  try {
    const q = query.trim();
    if (!q) {
      return { ok: false, error: "Ingresá tu número de celular o de pedido." };
    }

    const business = await rootDb.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true },
    });

    if (!business) {
      return { ok: false, error: "Restaurante no encontrado." };
    }

    const settings = await getSettings(business.id);
    const businessDate = currentBusinessDate(settings);
    const db = tenantDb(business.id);

    const isCode = !isNaN(Number(q));
    const codeNum = isCode ? Number(q) : -1;

    const order = await db.order.findFirst({
      where: {
        businessId: business.id,
        businessDate,
        OR: [
          ...(isCode ? [{ code: codeNum }] : []),
          { customerPhone: { contains: q } },
        ],
      },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        code: true,
        type: true,
        channel: true,
        status: true,
        deliveryStatus: true,
        turnNumber: true,
        customerName: true,
        customerPhone: true,
        deliveryAddress: true,
        totalCop: true,
        openedAt: true,
        items: {
          where: { status: { not: "ANULADO" } },
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            unitPriceCop: true,
            lineTotalCop: true,
            status: true,
          },
        },
      },
    });

    if (!order) {
      return { ok: false, error: "No se encontró ningún pedido reciente con este número de celular o código." };
    }

    return { ok: true, order };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "No se pudo consultar el pedido.";
    return { ok: false, error: errorMsg };
  }
}
