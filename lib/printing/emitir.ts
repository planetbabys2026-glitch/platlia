import "server-only";
import type { TenantDb } from "@/lib/db/tenant";
import { componerComanda, LINEAS_DESTACADAS_COMANDA } from "@/lib/printing/comanda";
import { componerRecibo } from "@/lib/printing/recibo";
import { anchoEnCaracteres } from "@/lib/printing/ticket";
import {
  encolarImpresion,
  impresoraDeEstacion,
  impresoraDeRecibos,
} from "@/lib/printing/cola";

/**
 * De un pedido a papel.
 *
 * Junta las tres piezas —la consulta, la composición y la cola— para que quien
 * cobra o manda a cocina no tenga que saber nada de impresoras. Todo se llama
 * **dentro de la transacción** que originó el hecho: encolar afuera abriría la
 * puerta a imprimir el recibo de una venta que después no se guardó.
 *
 * Ninguna de estas funciones lanza. Que la impresora esté mal configurada no
 * puede impedir que se cobre una venta: es la misma regla que "un correo nunca
 * tumba una operación". Devuelven cuántos trabajos dejaron encolados.
 */

type Db = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

/** El nombre canónico que ya usa el KDS para lo que no tiene estación. */
const SIN_ESTACION = "Sin estación";

/**
 * El recibo del cliente.
 *
 * Se compone con `componerRecibo`, el mismo módulo que pinta la pantalla de
 * `/imprimir/pedido/[id]`: si cada camino compusiera lo suyo, reimprimir daría un
 * tiquete distinto del que salió por la caja.
 */
export async function encolarRecibo(
  db: Db,
  businessId: string,
  orderId: string,
): Promise<number> {
  try {
    const impresora = await impresoraDeRecibos(db);
    if (!impresora) return 0;

    const pedido = await db.order.findFirst({
      where: { id: orderId },
      select: {
        code: true,
        type: true,
        status: true,
        turnNumber: true,
        openedAt: true,
        closedAt: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        deliveryAddress: true,
        docType: true,
        docNumber: true,
        guestsCount: true,
        subtotalCop: true,
        discountCop: true,
        deliveryFeeCop: true,
        tipCop: true,
        totalCop: true,
        paidCop: true,
        facturaElectronicaNumero: true,
        facturaElectronicaCufe: true,
        notaCreditoNumero: true,
        table: { select: { name: true } },
        openedBy: { select: { name: true } },
        business: {
          select: {
            name: true,
            legalName: true,
            taxId: true,
            address: true,
            phone: true,
            settings: {
              select: {
                timeZone: true,
                receiptWidth: true,
                receiptHeader: true,
                receiptFooter: true,
                turnNumberMax: true,
              },
            },
          },
        },
        items: {
          where: { status: { not: "ANULADO" } },
          orderBy: { createdAt: "asc" },
          select: {
            quantity: true,
            nameSnapshot: true,
            unitPriceCop: true,
            lineSubtotalCop: true,
            lineTaxCop: true,
            lineTotalCop: true,
            notes: true,
            taxRateNameSnapshot: true,
            taxRateBpSnapshot: true,
            modifiers: {
              orderBy: { sortOrder: "asc" },
              select: { optionNameSnapshot: true, priceDeltaCopSnapshot: true },
            },
          },
        },
        fiado: {
          select: {
            saldoCop: true,
            deudor: { select: { nombre: true, telefono: true } },
          },
        },
        payments: {
          where: { voidedAt: null },
          orderBy: { createdAt: "asc" },
          select: { method: true, amountCop: true, tenderedCop: true, changeCop: true },
        },
      },
    });
    if (!pedido) return 0;

    const settings = pedido.business.settings;
    const lineas = componerRecibo(pedido, pedido.business, {
      // El ancho es el de LA IMPRESORA, no el de la configuración del negocio:
      // un local puede tener la caja en 80 mm y la cocina en 55.
      ancho: anchoEnCaracteres(impresora.width),
      zona: settings?.timeZone ?? "America/Bogota",
      receiptHeader: settings?.receiptHeader,
      receiptFooter: settings?.receiptFooter,
      turnNumberMax: settings?.turnNumberMax ?? 99,
    });

    await encolarImpresion(db, businessId, {
      printerId: impresora.id,
      orderId,
      tipo: "RECIBO",
      lineas,
      lineasDestacadas: 1,
      abrirCajon: impresora.abreCajon,
    });

    return 1;
  } catch (error) {
    // Un problema de impresión no tumba el cobro.
    console.error("[impresion] no se pudo encolar el recibo", error);
    return 0;
  }
}

/**
 * Las comandas de cocina, una por estación.
 *
 * Un pedido con una cerveza y un churrasco genera dos papeles: uno para la barra
 * y otro para la parrilla. `Product.kitchenStation` es texto libre y el KDS ya
 * agrupa por ese string, así que acá se hace lo mismo.
 *
 * Solo entra lo que se acaba de mandar a la cocina —`sentToKitchenAt` dentro de
 * la ventana—, para que agregar un plato a una mesa no reimprima el pedido
 * entero.
 */
export async function encolarComandas(
  db: Db,
  businessId: string,
  orderId: string,
  desde: Date,
): Promise<number> {
  try {
    const settings = await db.businessSettings.findFirst({
      select: { comandaDestino: true, timeZone: true },
    });
    // El KDS le alcanza a la mayoría: la impresión de comandas es opcional y
    // arranca apagada.
    if (settings?.comandaDestino !== "IMPRESA" && settings?.comandaDestino !== "AMBAS") {
      return 0;
    }

    const pedido = await db.order.findFirst({
      where: { id: orderId },
      select: {
        code: true,
        type: true,
        turnNumber: true,
        customerName: true,
        deliveryAddress: true,
        openedAt: true,
        table: { select: { name: true } },
        items: {
          where: {
            status: { not: "ANULADO" },
            sentToKitchenAt: { gte: desde },
          },
          orderBy: { createdAt: "asc" },
          select: {
            quantity: true,
            nameSnapshot: true,
            notes: true,
            product: { select: { kitchenStation: true } },
            modifiers: {
              orderBy: { sortOrder: "asc" },
              select: { optionNameSnapshot: true },
            },
          },
        },
      },
    });
    if (!pedido || pedido.items.length === 0) return 0;

    const porEstacion = new Map<string, typeof pedido.items>();
    for (const item of pedido.items) {
      const estacion = item.product?.kitchenStation?.trim() || SIN_ESTACION;
      const actual = porEstacion.get(estacion) ?? [];
      actual.push(item);
      porEstacion.set(estacion, actual);
    }

    let encolados = 0;
    for (const [estacion, items] of porEstacion) {
      const impresora = await impresoraDeEstacion(db, estacion);
      if (!impresora) continue;

      const lineas = componerComanda(pedido, items, {
        ancho: anchoEnCaracteres(impresora.width),
        zona: settings?.timeZone ?? "America/Bogota",
        estacion,
      });

      await encolarImpresion(db, businessId, {
        printerId: impresora.id,
        orderId,
        tipo: "COMANDA",
        lineas,
        lineasDestacadas: LINEAS_DESTACADAS_COMANDA,
      });
      encolados++;
    }

    return encolados;
  } catch (error) {
    console.error("[impresion] no se pudieron encolar las comandas", error);
    return 0;
  }
}
