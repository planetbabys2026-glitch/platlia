import "server-only";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Recalcula y guarda los totales de un pedido.
 *
 * Se llama SIEMPRE dentro de la misma transacción que tocó los renglones. Los
 * totales están denormalizados en `Order` porque los informes no pueden depender
 * de sumar renglones al momento de leer, y esa copia solo es confiable si se
 * actualiza en el mismo commit que la cambió.
 *
 * No vuelve a redondear nada: cada renglón ya trae su impuesto redondeado por
 * lib/tax.ts y el total del pedido es su suma. Redondear de nuevo acá haría que
 * el tiquete mostrara renglones que no suman lo que dice el total.
 */
export async function recalcularTotales(
  tx: Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">,
  orderId: string,
) {
  const [items, pagos, pedido] = await Promise.all([
    tx.orderItem.findMany({
      where: { orderId, status: { not: "ANULADO" } },
      select: {
        lineSubtotalCop: true,
        lineTaxCop: true,
        lineTotalCop: true,
        discountCop: true,
      },
    }),
    tx.orderPayment.aggregate({
      where: { orderId, voidedAt: null },
      _sum: { amountCop: true },
    }),
    tx.order.findFirstOrThrow({
      where: { id: orderId },
      select: { tipCop: true, deliveryFeeCop: true, type: true },
    }),
  ]);

  const subtotalCop = items.reduce((t, i) => t + i.lineSubtotalCop, 0);
  const taxCop = items.reduce((t, i) => t + i.lineTaxCop, 0);
  const discountCop = items.reduce((t, i) => t + i.discountCop, 0);
  const consumoCop = items.reduce((t, i) => t + i.lineTotalCop, 0);
  const deliveryFeeCop = pedido.type === "DOMICILIO" ? (pedido.deliveryFeeCop ?? 0) : 0;

  return tx.order.update({
    where: { id: orderId },
    data: {
      subtotalCop,
      taxCop,
      discountCop,
      deliveryFeeCop,
      totalCop: consumoCop + pedido.tipCop + deliveryFeeCop,
      paidCop: pagos._sum.amountCop ?? 0,
    },
    select: {
      id: true,
      subtotalCop: true,
      taxCop: true,
      discountCop: true,
      tipCop: true,
      deliveryFeeCop: true,
      totalCop: true,
      paidCop: true,
      status: true,
      tableId: true,
    },
  });
}
