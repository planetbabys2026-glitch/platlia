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
