"use server";

import { revalidatePath } from "next/cache";
import { OrderChannel, OrderItemStatus, OrderStatus, OrderType } from "@/generated/prisma/enums";
import { licenciaVigente } from "@/lib/auth/reglas";
import { getSettings } from "@/features/negocio/queries";
import { sincronizarEstadoMesa } from "@/features/salon/estado-mesa";
import { recalcularTotales } from "@/features/pedidos/totales";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { crearPedidoClienteQRSchema, type CrearPedidoClienteQRInput } from "@/features/pedidos/qr-schemas";
import { describirAviso } from "@/lib/avisos";
import {
  publicarAviso,
  publishCocinaUpdate,
  publishDomiciliosUpdate,
  publishTurneroUpdate,
} from "@/lib/redis";
// eslint-disable-next-line no-restricted-imports -- Acción pública del menú QR para resolver el negocio por su slug público
import { rootDb } from "@/lib/db/root";
import { tenantDb } from "@/lib/db/tenant";
import { computeTaxLine } from "@/lib/tax";
import { currentBusinessDate } from "@/lib/time";
import { siguienteTurnoLibre } from "@/features/pedidos/turnos";
import { resolverModificadores } from "@/features/pedidos/modificadores";
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
      select: {
        id: true,
        name: true,
        slug: true,
        subscription: {
          select: { status: true, trialEndsAt: true, currentPeriodEnd: true, graceUntil: true },
        },
      },
    });

    if (!business) {
      return { ok: false, error: "Este establecimiento no está disponible o fue suspendido." };
    }

    // La licencia también manda acá. Esta acción no pasa por `defineAction` —es
    // pública, la usa un comensal sin sesión— así que el chequeo que el wrapper
    // hace por todos hay que hacerlo a mano. Sin esto, un negocio vencido seguía
    // recibiendo pedidos por QR indefinidamente: era la única forma de usar
    // Platlia para siempre sin pagar.
    if (!licenciaVigente(business.subscription).vigente) {
      return {
        ok: false,
        // No se dice "la licencia venció": el comensal no tiene nada que ver con
        // eso y enterarlo expone al negocio delante de su propio cliente.
        error: "Este menú no está recibiendo pedidos en este momento. Pedile al mesero que te atienda.",
      };
    }

    const settings = await getSettings(business.id);

    if (!settings.qrMenuEnabled) {
      return { ok: false, error: "El menú digital QR no está activado para este negocio." };
    }

    const businessDate = currentBusinessDate(settings);
    const puedeFacturar = puedeFacturarElectronicamente(settings);
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
      // El nombre va al aviso que salta en las demás pantallas: "Mesa 12 · Sofía"
      // se entiende de un vistazo, un id no.
      let mesaNombre: string | null = null;
      if (input.type === "MESA" && input.tableId) {
        const mesa = await tx.table.findFirst({
          where: { id: input.tableId, deletedAt: null },
          select: { id: true, name: true, status: true },
        });
        // Una mesa archivada o fuera de servicio no recibe pedidos: su QR puede
        // seguir pegado a una mesa que el negocio ya sacó del salón.
        if (mesa && mesa.status !== "INACTIVA") {
          tableId = mesa.id;
          mesaNombre = mesa.name;
        }
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
          // El nombre es la etiqueta de la cuenta: en la mesa el schema lo exige,
          // y en domicilio se cae a un genérico porque ahí lo que identifica al
          // pedido es el teléfono y la dirección.
          customerName: input.customerName?.trim() || "Cliente QR",
          customerPhone: input.customerPhone ?? null,
          // Los datos fiscales solo se guardan si el negocio de verdad puede
          // emitir factura electrónica; si no, quedarían ahí sin que nadie los
          // vaya a usar nunca.
          docType: puedeFacturar ? (input.docType ?? null) : null,
          docNumber: puedeFacturar ? (input.docNumber ?? null) : null,
          deliveryStatus: "PENDIENTE",
          deliveryAddress: input.customerAddress ?? null,
          notes: input.customerAddress ? `Domicilio: ${input.customerAddress}` : null,
          subtotalCop: 0,
          taxCop: 0,
          totalCop: 0,
        },
      });

      // 6. Insertar renglones de producto
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

        const { recargoCop, snapshots, opcionIds } = await resolverModificadores(
          tx,
          producto.id,
          producto.name,
          itemInput.modifierOptionIds ?? [],
        );

        const precio = producto.priceCop + recargoCop;

        const linea = computeTaxLine({
          unitPriceCop: precio,
          quantity: itemInput.quantity,
          taxRateBp: producto.taxRate.rateBp,
          taxIncluded: settings.pricesIncludeTax,
        });

        await tx.orderItem.create({
          data: {
            businessId: business.id,
            orderId: order.id,
            productId: producto.id,
            nameSnapshot: producto.name,
            unitPriceCop: precio,
            basePriceCopSnapshot: producto.priceCop,
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
            modifiers: {
              create: snapshots.map((s) => ({ businessId: business.id, ...s })),
            },
          },
        });

        await verificarYDescontarStockReceta(tx, business.id, producto.id, itemInput.quantity, {
          referenceId: order.id,
          inventoryEnabled: settings.inventoryEnabled,
          customNotes: `Pedido Menú QR x${itemInput.quantity}`,
          modifierOptionIds: opcionIds,
        });
      }

      // 7. Totales, con la misma función que usan la mesa y el POS. Antes se
      // sumaban a mano acá, que era la única de las cuatro rutas de creación de
      // renglones que no pasaba por `recalcularTotales`: cualquier cambio en cómo
      // se calcula un total se olvidaba justo del pedido que hace el cliente.
      const totales = await recalcularTotales(tx, order.id);

      // La mesa refleja sus cuentas: este escaneo abrió una más, y puede haber
      // otras del mesero o de los demás comensales.
      await sincronizarEstadoMesa(tx, tableId);

      return {
        orderId: order.id,
        code: order.code,
        turnNumber,
        type: order.type,
        totalCop: totales.totalCop,
        tableId,
        mesaNombre,
        cuenta: order.customerName,
        direccion: order.deliveryAddress,
        productos: input.items.length,
      };
    });

    // Notificar a cocina, turnero y domicilios vía SSE/Redis
    void publishCocinaUpdate(business.id);
    void publishTurneroUpdate(business.id);
    void publishDomiciliosUpdate(business.id);

    // Los renglones del QR nacen con `sentToKitchenAt` puesto: el cliente manda
    // el pedido derecho a la cocina, sin mesero de por medio. Así que un pedido
    // por QR siempre es una comanda nueva, y si además es a domicilio es también
    // un domicilio nuevo: son dos pantallas distintas y las dos tienen que
    // enterarse.
    void publicarAviso(
      business.id,
      describirAviso({
        tipo: "COCINA_NUEVA_COMANDA",
        orderId: resultado.orderId,
        code: resultado.code,
        mesa: resultado.mesaNombre,
        cuenta: resultado.cuenta,
        turno: resultado.turnNumber,
        productos: resultado.productos,
      }),
    );

    if (resultado.type === "DOMICILIO") {
      void publicarAviso(
        business.id,
        describirAviso({
          tipo: "DOMICILIO_NUEVO",
          orderId: resultado.orderId,
          code: resultado.code,
          cliente: resultado.cuenta,
          direccion: resultado.direccion,
          productos: resultado.productos,
        }),
      );
    }

    // El salón y la cocina se renderizan en el servidor: sin invalidarlas, la
    // cuenta que acaba de abrir el comensal no aparece hasta que alguien recarga.
    revalidatePath("/salon");
    revalidatePath("/cocina");
    revalidatePath("/caja");
    revalidatePath("/domicilios");

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
