import "server-only";

import { tenantDb } from "@/lib/db/tenant";
import { currentBusinessDate } from "@/lib/time";
import { getSettings } from "@/features/negocio/queries";

/**
 * Qué es un domicilio, para todas las consultas de acá.
 *
 * Son dos cosas a la vez: los que alguien tomó por teléfono o por el POS
 * (`type: "DOMICILIO"`) y los que entraron solos por el menú QR
 * (`channel: "DOMICILIO_QR"`). Sin este OR no se puede filtrar por
 * `deliveryStatus`: esa columna es un `String` con default `"PENDIENTE"`, así
 * que **todo** pedido del bar la tiene puesta y contarlos por ahí daría el día
 * entero.
 */
const ES_DOMICILIO = [{ type: "DOMICILIO" as const }, { channel: "DOMICILIO_QR" as const }];

/** Los que todavía no llegaron a destino: lo que la insignia del menú anuncia. */
export const DOMICILIOS_EN_CURSO = ["PENDIENTE", "EN_PREPARACION", "EN_CAMINO"];

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
  deliveryStatus: string;
  businessDate: Date;
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
      OR: ES_DOMICILIO,
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
      OR: ES_DOMICILIO,
      businessDate: currentBusinessDate(settings),
      deliveryStatus: { in: DOMICILIOS_EN_CURSO },
      status: { not: "ANULADA" },
    },
  });
}
