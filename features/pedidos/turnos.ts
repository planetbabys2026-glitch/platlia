import "server-only";
import type { TenantDb } from "@/lib/db/tenant";
import { siguienteTurno } from "@/lib/turns";

type Tx = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

/**
 * El próximo turno que se puede repartir en esta jornada.
 *
 * Se llama SIEMPRE dentro de la transacción que cobra el pedido —no la que lo
 * abre—: el turno se reparte recién cuando el cliente pagó de verdad, no cuando
 * empezó a pedir. Entre elegir el número y escribirlo no puede colarse otro
 * pedido.
 *
 * El número rota —al llegar al tope vuelve a 1— y por eso se repite dentro del
 * mismo día. Eso es a propósito: la alternativa, un índice único por jornada,
 * convertía el tope en un techo de pedidos para llevar por día. Lo que no puede
 * pasar es que dos personas esperando al mismo tiempo escuchen el mismo número,
 * y de eso se encarga esta función.
 */
export async function siguienteTurnoLibre(
  tx: Tx,
  businessDate: Date,
  max: number,
): Promise<number> {
  // El último ASIGNADO, por reciencia, no el más alto del día. Cuando la
  // numeración da la vuelta, el máximo se queda clavado en el tope: preguntarle
  // a él devolvería el 1 una y otra vez para el resto de la jornada.
  const ultimo = await tx.order.findFirst({
    where: { businessDate, turnNumber: { not: null } },
    orderBy: { openedAt: "desc" },
    select: { turnNumber: true },
  });

  const ocupados = await turnosEnPantalla(tx, businessDate);

  let turno = siguienteTurno(ultimo?.turnNumber ?? null, max);

  // Se saltea lo que sigue colgado en el televisor. El tope de vueltas es el
  // rango entero: si están todos ocupados —hay `max` personas esperando a la
  // vez— se reparte igual y se repite un número, porque negarle el pedido a
  // alguien sería peor que hacerlo mirar dos veces la pantalla.
  for (let vueltas = 0; ocupados.has(turno) && vueltas < max; vueltas++) {
    turno = siguienteTurno(turno, max);
  }

  return turno;
}

/**
 * Los turnos que un cliente todavía puede estar mirando.
 *
 * Tiene que coincidir con lo que muestra `getTurnero`, o se reparte un número
 * que sigue en pantalla. La sutileza que no es obvia: **un pedido pagado puede
 * seguir esperando.** Para llevar se cobra por adelantado y la comida sigue en
 * el fuego, así que el turno recién asignado en `registrarPago` sigue "en
 * pantalla" hasta que se entrega, no solo hasta que se cobra.
 */
async function turnosEnPantalla(tx: Tx, businessDate: Date): Promise<Set<number>> {
  const vivos = await tx.order.findMany({
    where: {
      businessDate,
      turnNumber: { not: null },
      status: { in: ["ABIERTA", "CUENTA_PEDIDA", "PAGADA"] },
      OR: [
        { items: { some: { status: { notIn: ["ENTREGADO", "ANULADO"] } } } },
        { items: { none: {} } },
      ],
    },
    select: { turnNumber: true },
  });

  return new Set(vivos.map((o) => o.turnNumber!));
}
