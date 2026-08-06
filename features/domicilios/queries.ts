import "server-only";

import { tenantDb } from "@/lib/db/tenant";
import { currentBusinessDate } from "@/lib/time";
import { getSettings } from "@/features/negocio/queries";

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
      OR: [
        { type: "DOMICILIO" },
        { channel: "DOMICILIO_QR" },
      ],
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
