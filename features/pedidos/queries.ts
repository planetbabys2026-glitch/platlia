import "server-only";
import { tenantDb } from "@/lib/db/tenant";

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
      subtotalCop: true,
      taxCop: true,
      discountCop: true,
      tipCop: true,
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
          nameSnapshot: true,
          unitPriceCop: true,
          quantity: true,
          lineTotalCop: true,
          lineTaxCop: true,
          taxRateBpSnapshot: true,
          status: true,
          notes: true,
          canceledReason: true,
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
      subtotalCop: true,
      taxCop: true,
      discountCop: true,
      tipCop: true,
      totalCop: true,
      paidCop: true,
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
          notes: true,
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
          variants: {
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, priceCop: true },
          },
        },
      },
    },
  });
}

/** Los pedidos que siguen vivos, para el panel y para lo que no es mesa. */
export async function getPedidosAbiertos(businessId: string) {
  return tenantDb(businessId).order.findMany({
    where: { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
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
      table: { select: { name: true } },
    },
  });
}
