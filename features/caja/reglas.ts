import type { Prisma } from "@/generated/prisma/client";
import { DOMICILIOS_COBRABLES } from "@/features/domicilios/reglas";

/**
 * Quién tiene algo que cobrar en la caja.
 *
 * **Un pedido entra a la caja porque alguien lo mandó, nunca solo.** Hay dos
 * puertas y ninguna es automática:
 *
 * 1. `status = CUENTA_PEDIDA` — lo escribe una persona: el mesero desde la cuenta
 *    de la mesa, o quien atiende desde el POS. Es `pedirCuenta`.
 * 2. `deliveryStatus ∈ DOMICILIOS_COBRABLES` — el recorrido propio del domicilio,
 *    donde el disparador explícito es que la cocina terminó el último renglón.
 *
 * Antes había dos ramas más y las dos mandaban cuentas a la caja sin que nadie lo
 * decidiera. `{ tableId: null, status: "ABIERTA" }` metía todo pedido sin mesa
 * apenas nacía —los del POS guardados en espera, los recién mandados a cocina y,
 * como un domicilio nunca tiene mesa, **todos los domicilios**, incluso sin
 * confirmar—, con lo cual anulaba por completo a la puerta de arriba. Y
 * `{ items: { every: LISTO|ENTREGADO|ANULADO } }` daba la cuenta por pedida en
 * cuanto la cocina terminaba: el plato sale, y la cuenta aparecía en la caja con
 * la gente todavía comiendo. Que la comida esté lista no es que el cliente quiera
 * irse.
 *
 * Vive acá y no en `queries.ts` para poder probar la regla sin base: `queries.ts`
 * tiene `server-only` y arrastra Prisma. El fragmento y la función pura de abajo
 * dicen lo mismo y hay un test que las contrasta.
 */
export const HAY_QUE_COBRAR = {
  // Lo cobrado y lo anulado no vuelven: un domicilio ya pagado está EN_CAMINO y
  // seguiría cumpliendo la segunda puerta.
  status: { in: ["ABIERTA", "CUENTA_PEDIDA"] },
  items: { some: { status: { not: "ANULADO" } } },
  OR: [
    { status: "CUENTA_PEDIDA" },
    { deliveryStatus: { in: [...DOMICILIOS_COBRABLES] } },
  ],
} satisfies Prisma.OrderWhereInput;

/** El espejo puro de `HAY_QUE_COBRAR`, para tests y para leer la regla de un vistazo. */
export function debeIrACaja(pedido: {
  status: string;
  deliveryStatus: string | null;
  /** Si le queda al menos un renglón sin anular. */
  tieneItems: boolean;
}): boolean {
  if (pedido.status !== "ABIERTA" && pedido.status !== "CUENTA_PEDIDA") return false;
  if (!pedido.tieneItems) return false;

  return (
    pedido.status === "CUENTA_PEDIDA" ||
    (pedido.deliveryStatus !== null &&
      (DOMICILIOS_COBRABLES as readonly string[]).includes(pedido.deliveryStatus))
  );
}

/**
 * Si este movimiento saca plata del negocio.
 *
 * Es lo que decide si hay que pedir la clave del propietario. El tipo no alcanza
 * por sí solo: `AJUSTE` es el único que admite signo, y un ajuste negativo es
 * exactamente lo mismo que un gasto —plata que estaba y ya no está— escrito con
 * otro nombre. Dejarlo afuera sería dejar abierta la puerta de al lado.
 */
export function esSalidaDeDinero(type: string, amountCop: number): boolean {
  if (type === "EGRESO" || type === "RETIRO") return true;
  if (type === "AJUSTE") return amountCop < 0;
  return false;
}

/** Un turno abierto, con lo mínimo para decidir cuál cobra. */
export type SesionAbierta = {
  id: string;
  openedById: string;
  /** Para poder nombrar la caja en el mensaje de error. */
  cajaNombre: string;
};

export type ResultadoSesionDeCobro =
  | { ok: true; cashSessionId: string }
  | { ok: false; motivo: "SIN_CAJA" | "VARIAS_Y_NINGUNA_TUYA" };

/**
 * En qué caja cae el dinero de este cobro.
 *
 * Mientras hubo una sola caja por negocio la pregunta no existía: `findFirst` y
 * listo. Con varias, elegir mal es plata que aparece en el arqueo de otra
 * persona, y el faltante lo termina pagando quien no lo hizo.
 *
 * El orden es el de la responsabilidad:
 *
 * 1. **La tuya.** Si abriste turno, ahí va lo que cobrás. Es el caso normal.
 * 2. **La única abierta.** El dueño o el administrador que cobran un rato sin
 *    tener turno propio: si hay una sola caja abierta no hay ambigüedad, y el
 *    pago igual queda firmado con `receivedById`.
 * 3. **Se rechaza.** Con dos cajas abiertas y ninguna tuya, cualquier elección
 *    es adivinar de quién es la plata. Es preferible pedir que abra su turno.
 */
export function sesionDeCobro(
  abiertas: readonly SesionAbierta[],
  userId: string,
): ResultadoSesionDeCobro {
  if (abiertas.length === 0) return { ok: false, motivo: "SIN_CAJA" };

  const propia = abiertas.find((s) => s.openedById === userId);
  if (propia) return { ok: true, cashSessionId: propia.id };

  if (abiertas.length === 1) return { ok: true, cashSessionId: abiertas[0].id };

  return { ok: false, motivo: "VARIAS_Y_NINGUNA_TUYA" };
}
