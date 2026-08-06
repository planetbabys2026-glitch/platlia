import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/**
 * Los turnos que se muestran en el televisor del salón.
 *
 * Un turno se canta cuando el pedido COMPLETO está listo, no cuando sale el
 * primer plato: al cliente que pidió hamburguesa y papas no se le grita el
 * número para darle media orden. Por eso la clasificación mira todos los
 * renglones del pedido y no cada uno por su lado.
 */

export type Turno = {
  orderId: string;
  turno: number;
  nombre: string | null;
  isMesa: boolean;
  /** Desde cuándo está listo o esperando, en milisegundos de época. */
  desde: number;
};

export type Turnero = {
  listos: Turno[];
  preparando: Turno[];
};

export async function getTurnero(businessId: string, businessDate: Date): Promise<Turnero> {
  const pedidos = await tenantDb(businessId).order.findMany({
    where: {
      businessDate,
      status: { in: ["ABIERTA", "CUENTA_PEDIDA", "PAGADA"] },
    },
    orderBy: { openedAt: "asc" },
    select: {
      id: true,
      code: true,
      type: true,
      turnNumber: true,
      customerName: true,
      openedAt: true,
      items: {
        where: { status: { not: "ANULADO" } },
        select: { status: true, readyAt: true },
      },
    },
  });

  const listos: Turno[] = [];
  const preparando: Turno[] = [];

  for (const pedido of pedidos) {
    if (pedido.items.length === 0) continue;

    const entregados = pedido.items.filter((i) => i.status === "ENTREGADO").length;
    // Ya se lo llevaron entero: sale del televisor.
    if (entregados === pedido.items.length) continue;

    const terminados = pedido.items.filter(
      (i) => i.status === "LISTO" || i.status === "ENTREGADO",
    );

    const turnoNumero = pedido.turnNumber ?? pedido.code;

    const turno: Turno = {
      orderId: pedido.id,
      turno: turnoNumero,
      nombre: pedido.customerName,
      isMesa: pedido.type === "MESA",
      desde: pedido.openedAt.getTime(),
    };

    if (terminados.length === pedido.items.length) {
      // El pedido está completo: se canta desde que salió el último plato.
      const ultimo = Math.max(
        ...terminados.map((i) => i.readyAt?.getTime() ?? pedido.openedAt.getTime()),
      );
      listos.push({ ...turno, desde: ultimo });
    } else {
      preparando.push(turno);
    }
  }

  // Lo listo, lo más reciente arriba: es lo que la gente está esperando oír.
  listos.sort((a, b) => b.desde - a.desde);
  preparando.sort((a, b) => a.desde - b.desde);

  return { listos, preparando };
}
