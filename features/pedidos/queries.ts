import "server-only";
import { getSettings } from "@/features/negocio/queries";
import { tenantDb } from "@/lib/db/tenant";
import { currentBusinessDate } from "@/lib/time";

/** El pedido con todo lo que necesita la pantalla de cuenta. */
export async function getPedido(businessId: string, orderId: string) {
  return tenantDb(businessId).order.findFirst({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      turnNumber: true,
      type: true,
      status: true,
      businessDate: true,
      openedAt: true,
      guestsCount: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      docType: true,
      docNumber: true,
      deliveryAddress: true,
      notes: true,
      subtotalCop: true,
      taxCop: true,
      discountCop: true,
      tipCop: true,
      deliveryFeeCop: true,
      totalCop: true,
      paidCop: true,
      canceledReason: true,
      table: { select: { id: true, name: true } },
      openedBy: { select: { name: true } },
      items: {
        // El orden de llegada es el orden en que se cantó a la cocina.
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          nameSnapshot: true,
          unitPriceCop: true,
          quantity: true,
          lineTotalCop: true,
          lineTaxCop: true,
          taxRateBpSnapshot: true,
          basePriceCopSnapshot: true,
          status: true,
          sentToKitchenAt: true,
          notes: true,
          canceledReason: true,
          modifiers: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              optionId: true,
              groupNameSnapshot: true,
              optionNameSnapshot: true,
              priceDeltaCopSnapshot: true,
            },
          },
        },
      },
      payments: {
        where: { voidedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          method: true,
          amountCop: true,
          tenderedCop: true,
          changeCop: true,
          createdAt: true,
        },
      },
    },
  });
}

/**
 * Todo lo que lleva el tiquete, en una consulta.
 *
 * Sale de las instantáneas del renglón —`nameSnapshot`, `unitPriceCop`,
 * `taxRateBpSnapshot`— y no de los productos actuales: un tiquete reimpreso seis
 * meses después tiene que salir idéntico al original aunque el precio haya
 * cambiado tres veces.
 */
export async function getPedidoParaTiquete(businessId: string, orderId: string) {
  return tenantDb(businessId).order.findFirst({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      turnNumber: true,
      type: true,
      status: true,
      businessDate: true,
      openedAt: true,
      closedAt: true,
      guestsCount: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      docType: true,
      docNumber: true,
      deliveryAddress: true,
      subtotalCop: true,
      discountCop: true,
      tipCop: true,
      deliveryFeeCop: true,
      totalCop: true,
      paidCop: true,
      // La tirilla de una venta facturada tiene que llevar el número, el CUFE y
      // el QR de la DIAN, o no sirve como comprobante.
      facturaElectronicaNumero: true,
      facturaElectronicaCufe: true,
      facturaElectronicaUrlQr: true,
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
              pricesIncludeTax: true,
              turnNumberMax: true,
            },
          },
        },
      },
      items: {
        where: { status: { not: "ANULADO" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          unitPriceCop: true,
          lineSubtotalCop: true,
          lineTaxCop: true,
          lineTotalCop: true,
          taxRateBpSnapshot: true,
          taxRateNameSnapshot: true,
          basePriceCopSnapshot: true,
          notes: true,
          modifiers: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              groupNameSnapshot: true,
              optionNameSnapshot: true,
              priceDeltaCopSnapshot: true,
            },
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
        select: {
          id: true,
          method: true,
          amountCop: true,
          tenderedCop: true,
          changeCop: true,
        },
      },
    },
  });
}

/** La carta, agrupada como se toca en la pantalla. */
export async function getCarta(businessId: string) {
  return tenantDb(businessId).category.findMany({
    where: { active: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      products: {
        where: { active: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          priceCop: true,
          isAvailable: true,
          imageUrl: true,
          trackStock: true,
          stockQty: true,
          hasRecipe: true,
          recipeNeedsModifiers: true,
          // La tarifa viaja con la carta para que el renglón que se anticipa al
          // servidor calcule su impuesto con la misma tarifa que va a quedar
          // congelada en el pedido, y no con una estimación del negocio.
          taxRate: { select: { rateBp: true } },
          recipeItems: {
            select: {
              quantityRequired: true,
              inventoryItem: {
                select: { id: true, name: true, unit: true, stockCurrent: true },
              },
            },
          },
          // Los grupos viajan con la carta y no se piden al tocar el producto:
          // el modal tiene que abrir instantáneo con el dedo todavía en la
          // pantalla, y una ida al servidor en el medio se siente rota.
          modifierGroups: {
            where: { group: { deletedAt: null, active: true } },
            orderBy: { sortOrder: "asc" },
            select: {
              required: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  helpText: true,
                  minSelect: true,
                  maxSelect: true,
                  options: {
                    where: { deletedAt: null, active: true },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                    select: {
                      id: true,
                      name: true,
                      priceDeltaCop: true,
                      isDefault: true,
                      supplies: {
                        select: {
                          quantityRequired: true,
                          inventoryItem: {
                            select: { id: true, name: true, unit: true, stockCurrent: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Los pedidos que siguen vivos, para el panel y para lo que no es mesa.
 *
 * Acotado a la jornada en curso. Sin eso, un pedido que alguien se olvidó de
 * cerrar anteanoche seguía apareciendo en la lista "En espera" del POS para
 * siempre, y encima trababa el cierre de caja de una jornada que no era la suya.
 */
export async function getPedidosAbiertos(businessId: string) {
  const settings = await getSettings(businessId);
  const pedidos = await tenantDb(businessId).order.findMany({
    where: {
      businessDate: currentBusinessDate(settings),
      status: { in: ["ABIERTA", "CUENTA_PEDIDA"] },
    },
    orderBy: { openedAt: "asc" },
    select: {
      id: true,
      code: true,
      turnNumber: true,
      type: true,
      status: true,
      totalCop: true,
      openedAt: true,
      customerName: true,
      // "En sitio" viaja como prefijo de las notas, no como `type`: la lista del
      // salón lo lee de acá para poder etiquetarlo.
      notes: true,
      tableId: true,
      table: { select: { name: true } },
      // Los que quedaron en cero se pueden cerrar sin cobrar, y hay que poder
      // distinguirlos en la lista: si no, se quedan abiertos toda la jornada y
      // después trancan el cierre de caja.
      _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
    },
  });

  return pedidos.map(({ _count, ...pedido }) => ({ ...pedido, renglones: _count.items }));
}
