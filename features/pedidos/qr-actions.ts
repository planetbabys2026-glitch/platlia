"use server";

import { revalidatePath } from "next/cache";
import {
  type DeliveryStatus,
  OrderChannel,
  OrderItemStatus,
  OrderStatus,
  OrderType,
} from "@/generated/prisma/enums";
import { estadoInicial } from "@/features/domicilios/reglas";
import { avisarAlAgente } from "@/lib/printing/cola";
import { encolarComandas } from "@/lib/printing/emitir";
import { ErrorDeUsuario } from "@/lib/actions/define-action";
import { licenciaVigente } from "@/lib/auth/reglas";
import { getSettings } from "@/features/negocio/queries";
import { sincronizarEstadoMesa } from "@/features/salon/estado-mesa";
import { recalcularTotales } from "@/features/pedidos/totales";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
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
import { evaluarEstadoNegocio } from "@/features/negocio/horarios";
import { parseExtraSettings } from "@/features/negocio/extra-settings";
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

<<<<<<< HEAD
    const extra = parseExtraSettings(settings.rolePermissions);
    const estadoNegocio = evaluarEstadoNegocio({
      timeZone: settings.timeZone,
      scheduleEnabled: extra.scheduleEnabled,
      scheduleOpeningTime: extra.scheduleOpeningTime,
      scheduleClosingTime: extra.scheduleClosingTime,
      scheduleStatus: extra.scheduleStatus,
    });
    if (!estadoNegocio.abierto) {
      return {
        ok: false,
        error: estadoNegocio.razon || "El establecimiento se encuentra cerrado en este momento.",
      };
    }

    if (input.type === "DOMICILIO") {
      if (!settings.deliveryEnabled || extra.deliveryPaused) {
        return {
          ok: false,
          error: "Los pedidos a domicilio no están disponibles en este momento por alta demanda o decisión del establecimiento.",
        };
      }
    }

=======
    /**
     * Los domicilios por QR se abren y se cierran con el turno.
     *
     * Sin esto, un comensal mandaba un domicilio a cualquier hora —con la caja
     * cerrada, el local vacío y nadie en la cocina— y el pedido quedaba esperando
     * a que alguien lo descubriera a la mañana siguiente. La pantalla ya lo avisa
     * al abrir, pero esto es una Server Action pública: es alcanzable con `curl`
     * sin pasar por ninguna pantalla, así que la puerta se cierra acá.
     *
     * Se mira solo para el domicilio: un pedido de mesa lo hace alguien que está
     * sentado adentro, así que el local está abierto por definición.
     */
    if (input.type === "DOMICILIO" && !settings.qrDeliveryEnabled) {
      return {
        ok: false,
        error: "Por ahora no estamos recibiendo domicilios. Escribinos para saber a qué hora abrimos.",
      };
    }

>>>>>>> 424db5e1eef19ef9edbb4193f9eb8f5af8ad5591
    const businessDate = currentBusinessDate(settings);
    const puedeFacturar = puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada());
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
      if (input.type === "MESA") {
        /**
         * Un pedido de mesa SIN mesa no se crea: se rechaza.
         *
         * Antes, si el `tableId` no resolvía —una mesa archivada, borrada, de otro
         * negocio, o un QR al que alguien le sacó el parámetro— el pedido entraba
         * igual con `tableId: null`. Al mesero le llegaba una comanda que decía
         * "mesa" y no decía cuál, y no había forma de averiguarlo: el comensal ya
         * se había ido a sentar. Es exactamente el pedido que parece mezclado.
         *
         * La búsqueda va por `tx`, que es `tenantDb(business.id)`: el id de una
         * mesa de otra empresa no resuelve acá aunque venga escrito en la URL.
         */
        const mesa = input.tableId
          ? await tx.table.findFirst({
              where: { id: input.tableId, deletedAt: null },
              select: { id: true, name: true, status: true },
            })
          : null;

        if (!mesa || mesa.status === "INACTIVA") {
          throw new ErrorDeUsuario(
            "Este código QR ya no corresponde a una mesa activa. Pedile al mesero que te tome el pedido.",
          );
        }

        tableId = mesa.id;
        mesaNombre = mesa.name;
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
          // Un domicilio del QR entra SIN CONFIRMAR: la dirección la escribió el
          // comensal y nadie la leyó todavía. Un pedido de mesa no tiene reparto.
          deliveryStatus:
            input.type === "DOMICILIO" ? estadoInicial(channel) as DeliveryStatus : null,
          deliveryAddress: input.customerAddress ?? null,
          deliveryFeeCop: input.type === "DOMICILIO" ? (settings.deliveryFeeCop ?? 0) : 0,
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
            taxRate: { select: { rateBp: true, name: true, kind: true } },
          },
        });

        // Un producto que ya no está se RECHAZA, no se descarta. Acá había un
        // `continue`: el comensal tocaba confirmar, el pedido entraba sin ese
        // renglón y nadie le decía nada —ni a él ni a la cocina—, así que la
        // primera noticia era la cuenta con un plato menos del que había pedido.
        if (!producto) {
          const nombre = await tx.product.findFirst({
            where: { id: itemInput.productId },
            select: { name: true },
          });
          throw new ErrorDeUsuario(
            nombre
              ? `Se acabó ${nombre.name}. Quitalo del pedido para poder confirmarlo.`
              : "Uno de los productos del pedido ya no está disponible. Revisá el carrito.",
          );
        }

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

        // Antes del create: de acá sale el costo que el renglón congela.
        const { unitCostCop } = await verificarYDescontarStockReceta(
          tx,
          business.id,
          producto.id,
          itemInput.quantity,
          {
            referenceId: order.id,
            inventoryEnabled: settings.inventoryEnabled,
            permitirVentaSinStock: settings.permitirVentaSinStock,
            customNotes: `Pedido Menú QR x${itemInput.quantity}`,
            modifierOptionIds: opcionIds,
          },
        );

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
            // El `kind` también se congela: la DIAN separa IVA de impuesto al
            // consumo, y leerlo del producto actual al facturar sería declarar una
            // venta vieja con la tarifa de hoy.
            taxKindSnapshot: producto.taxRate.kind,
            taxIncludedSnapshot: settings.pricesIncludeTax,
            quantity: itemInput.quantity,
            lineSubtotalCop: linea.lineSubtotalCop,
            lineTaxCop: linea.lineTaxCop,
            lineTotalCop: linea.lineTotalCop,
            notes: itemInput.notes ?? null,
            createdById: primerMiembro.userId,
            status: OrderItemStatus.PENDIENTE,
            /**
             * Un pedido de MESA sí va derecho a la cocina: el comensal está
             * sentado y la mesa ya está identificada.
             *
             * Uno a DOMICILIO no. La dirección, el teléfono y el costo de envío
             * los escribió alguien que no trabaja acá, y hasta que el módulo de
             * domicilios no los confirme no hay nada que cocinar. Antes se
             * sellaba acá y la comanda aparecía en la plancha en el mismo commit
             * en que el comensal tocaba "enviar".
             */
            sentToKitchenAt: input.type === "DOMICILIO" ? null : new Date(),
            unitCostCopSnapshot: unitCostCop,
            lineCostCop: unitCostCop === null ? null : unitCostCop * itemInput.quantity,
            modifiers: {
              create: snapshots.map((s) => ({ businessId: business.id, ...s })),
            },
          },
        });
      }

      // 7. La propina que eligió el comensal, antes de recalcular para que entre
      // en el total con el que la cuenta llega a la caja.
      if (input.tipCop !== undefined && input.tipCop > 0) {
        await tx.order.update({ where: { id: order.id }, data: { tipCop: input.tipCop } });
      }

      // 8. Totales, con la misma función que usan la mesa y el POS. Antes se
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
        // Un pedido de mesa por QR va derecho a la plancha, así que su comanda
        // se encola acá. El domicilio no: la suya sale al confirmarlo.
        impresos:
          input.type === "DOMICILIO"
            ? 0
            : await encolarComandas(tx, business.id, order.id, order.openedAt),
      };
    });

    if (resultado.impresos > 0) avisarAlAgente(business.id);

    // Notificar a cocina, turnero y domicilios vía SSE/Redis
    void publishCocinaUpdate(business.id);
    void publishTurneroUpdate(business.id);
    void publishDomiciliosUpdate(business.id);

    /**
     * A cocina se le avisa solo de lo que le llegó.
     *
     * Un pedido de mesa por QR va derecho a la plancha y es una comanda nueva.
     * Uno a domicilio todavía no: su aviso a cocina lo emite
     * `confirmarDomicilio`, cuando alguien da por buena la dirección. Antes este
     * toast saltaba siempre, así que cocina se enteraba de comida que no tenía
     * que preparar.
     */
    if (resultado.type !== "DOMICILIO") {
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
    }

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
    // Solo los mensajes escritos para que los lea una persona salen a la calle.
    // Cualquier otra excepción —una de Prisma, por ejemplo— le contaría al
    // comensal cómo está hecha la base por dentro. Esto es una ruta pública.
    if (err instanceof ErrorDeUsuario) return { ok: false, error: err.message };
    console.error("[qr] no se pudo crear el pedido", err);
    return { ok: false, error: "No pudimos tomar tu pedido. Probá de nuevo o pedile al mesero." };
  }
}

export async function consultarEstadoPedidoQR(businessSlug: string, query: string) {
  try {
    const q = query.trim();
    if (!q) {
      return { ok: false, error: "Ingresá tu número de celular." };
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

    /**
     * Esta consulta es pública y sin sesión: hay que poder rastrear el pedido
     * propio sin registrarse. Por eso mismo tiene que ser imposible leer el ajeno.
     *
     * Como estaba, no lo era. `code: Number(q)` con `q = "3"` devolvía el pedido
     * número 3 del negocio —de quien fuera— con su nombre, su teléfono y su
     * dirección de entrega. Escribir 1, 2, 3… era leer la agenda del día entera.
     * Y `customerPhone: { contains: q }` con "300" devolvía el pedido más reciente
     * de cualquiera cuyo número contuviera esos dígitos.
     *
     * Ahora hace falta el teléfono COMPLETO. No es una contraseña, pero es lo
     * único que el cliente tiene y que un curioso no adivina de a una prueba por
     * vez. El número de pedido solo sirve acompañado del teléfono.
     */
    const soloDigitos = q.replace(/\D/g, "");
    const MINIMO_DE_TELEFONO = 7; // en Colombia, un fijo sin indicativo

    /**
     * El id del propio pedido también sirve, y es la vía del pedido de mesa: ahí
     * no hay teléfono que pedir. Es un cuid de 25 caracteres, así que no se
     * adivina probando —que es justamente lo que sí pasaba con el número de
     * pedido— y lo tiene solo quien acaba de hacer el pedido en esta pantalla.
     */
    const pareceId = /^[a-z0-9]{20,}$/i.test(q);

    if (!pareceId && soloDigitos.length < MINIMO_DE_TELEFONO) {
      return {
        ok: false,
        error: "Escribí tu número de celular completo, el mismo con el que hiciste el pedido.",
      };
    }

    const order = await db.order.findFirst({
      where: {
        businessId: business.id,
        businessDate,
        // Igualdad, no `contains`: con `contains` un número corto barría los
        // pedidos de todos los que lo tuvieran adentro.
        ...(pareceId ? { id: q } : { customerPhone: soloDigitos }),
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
      return {
        ok: false,
        error: "No encontramos un pedido de hoy con ese celular. Revisá el número, o pedile al mesero que lo busque.",
      };
    }

    return { ok: true, order };
  } catch (err: unknown) {
    if (err instanceof ErrorDeUsuario) return { ok: false, error: err.message };
    console.error("[qr] no se pudo consultar el pedido", err);
    return { ok: false, error: "No se pudo consultar el pedido." };
  }
}
