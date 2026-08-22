import "server-only";

import type { DeliveryStatus } from "@/generated/prisma/enums";
import { tenantDb } from "@/lib/db/tenant";
import { currentBusinessDate } from "@/lib/time";
import { getSettings } from "@/features/negocio/queries";
import { DOMICILIOS_EN_CURSO } from "@/features/domicilios/reglas";

/**
 * Qué es un domicilio: tener estado de reparto.
 *
 * Antes hacía falta un OR entre `type: "DOMICILIO"` y `channel: "DOMICILIO_QR"`
 * porque `deliveryStatus` era un `String` con `@default("PENDIENTE")` y **todo**
 * pedido del bar lo traía puesto —una mesa incluida—, así que filtrar por esa
 * columna devolvía el día entero. Ahora es un enum nullable y la columna dice
 * exactamente lo que parece decir.
 */
const ES_DOMICILIO = { deliveryStatus: { not: null } };

export { DOMICILIOS_EN_CURSO };

export type DomicilioItem = {
  id: string;
  nameSnapshot: string;
  unitPriceCop: number;
  quantity: number;
  lineTotalCop: number;
  notes: string | null;
};

export type DomicilioPedido = {
  id: string;
  code: number;
  type: string;
  channel: string;
  status: string;
  deliveryStatus: DeliveryStatus | null;
  businessDate: Date;
  deliveryConfirmedAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  turnNumber: number | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  docType: string | null;
  docNumber: string | null;
  notes: string | null;
  subtotalCop: number;
  taxCop: number;
  deliveryFeeCop: number;
  totalCop: number;
  paidCop: number;
  openedAt: Date;
  items: DomicilioItem[];
};

export async function getDomicilios(businessId: string): Promise<DomicilioPedido[]> {
  const settings = await getSettings(businessId);
  const businessDate = currentBusinessDate(settings);
  const db = tenantDb(businessId);

  const orders = await db.order.findMany({
    where: {
      businessId,
      ...ES_DOMICILIO,
      businessDate,
    },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      code: true,
      type: true,
      channel: true,
      status: true,
      deliveryStatus: true,
      businessDate: true,
      deliveryConfirmedAt: true,
      dispatchedAt: true,
      deliveredAt: true,
      turnNumber: true,
      customerName: true,
      customerPhone: true,
      deliveryAddress: true,
      docType: true,
      docNumber: true,
      notes: true,
      subtotalCop: true,
      taxCop: true,
      deliveryFeeCop: true,
      totalCop: true,
      paidCop: true,
      openedAt: true,
      items: {
        where: { status: { not: "ANULADO" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          unitPriceCop: true,
          quantity: true,
          lineTotalCop: true,
          notes: true,
        },
      },
    },
  });

  return orders;
}

/**
 * Cuántos domicilios del día siguen en curso: lo que muestra la insignia del
 * menú y el chip de la pantalla.
 *
 * Se cuenta en la base y no filtrando la lista en memoria porque el shell lo
 * pide desde cualquier pantalla, y traerse los pedidos enteros con sus renglones
 * para contarlos sería pagar la consulta grande por un número.
 */
export async function contarDomiciliosActivos(businessId: string): Promise<number> {
  const settings = await getSettings(businessId);

  return tenantDb(businessId).order.count({
    where: {
      businessDate: currentBusinessDate(settings),
      deliveryStatus: { in: [...DOMICILIOS_EN_CURSO] },
      status: { not: "ANULADA" },
    },
  });
}
