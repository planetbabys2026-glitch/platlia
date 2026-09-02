import type { Prisma } from "@/generated/prisma/client";
import { DOMICILIOS_COBRABLES } from "@/features/domicilios/reglas";

/**
 * Quién tiene algo que cobrar en la caja.
 *
 * **Todo consumo que ya salió a cocina es una cuenta por cobrar.** Antes hacían
 * falta dos puertas explícitas —que el mesero tocara "pedir la cuenta", o el
 * recorrido propio del domicilio— y ninguna era automática, con el argumento de
 * que la comida lista no significa que el cliente quiera irse.
 *
 * Ese argumento valía cuando **el cajero veía el salón**. Desde que el salón es
 * la pantalla del mesero y nadie más, el gesto dejó de significar "quieren pagar"
 * y pasó a ser un trámite que le esconde al cajero la mitad de su trabajo: la
 * plata que hay viva en el piso. Un cajero que no sabe qué se está consumiendo no
 * puede cuadrar nada ni contestar "¿cuánto va la 4?" sin levantarse.
 *
 * Lo que aquella decisión sí protegía —distinguir la mesa que pidió la cuenta de
 * la que todavía está comiendo— no se pierde: dejó de ser un **filtro** y pasó a
 * ser el **orden y el rótulo** de la lista (`estadoDeCobro`). La información
 * sigue estando; lo que cambió es que ya no decide quién existe para la caja.
 *
 * Las tres puertas, entonces:
 *
 * 1. `status = CUENTA_PEDIDA` — alguien la mandó a propósito. Va primero.
 * 2. `deliveryStatus ∈ DOMICILIOS_COBRABLES` — el recorrido del domicilio.
 * 3. **Al menos un renglón enviado a cocina** — hay consumo real en la mesa.
 *
 * Lo que sigue afuera es lo que todavía no es consumo: el carrito del POS que
 * nadie mandó, y la mesa recién sentada sin nada pedido. Esa es la línea, y es la
 * que importa: la caja lista lo que **ya se sirvió**, no lo que alguien está
 * pensando pedir.
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
    { items: { some: { sentToKitchenAt: { not: null }, status: { not: "ANULADO" } } } },
  ],
} satisfies Prisma.OrderWhereInput;

/** El espejo puro de `HAY_QUE_COBRAR`, para tests y para leer la regla de un vistazo. */
export function debeIrACaja(pedido: {
  status: string;
  deliveryStatus: string | null;
  /** Si le queda al menos un renglón sin anular. */
  tieneItems: boolean;
  /** Si al menos uno de esos renglones ya salió a cocina. */
  tieneItemsEnCocina: boolean;
}): boolean {
  if (pedido.status !== "ABIERTA" && pedido.status !== "CUENTA_PEDIDA") return false;
  if (!pedido.tieneItems) return false;

  return (
    pedido.status === "CUENTA_PEDIDA" ||
    (pedido.deliveryStatus !== null &&
      (DOMICILIOS_COBRABLES as readonly string[]).includes(pedido.deliveryStatus)) ||
    pedido.tieneItemsEnCocina
  );
}

/**
 * En qué punto está una cuenta de la caja, que es lo que decide su orden.
 *
 * Con las tres puertas abiertas, la lista pasó de ser "lo que alguien mandó" a
 * ser el piso entero, y sin jerarquía eso es peor que antes: la mesa que levanta
 * la mano queda perdida entre las que recién pidieron. El orden es el que usaría
 * cualquiera parado en la caja:
 *
 * 1. **Pidió la cuenta.** Hay alguien esperando para pagar. Es lo único urgente.
 * 2. **Listo.** Salió todo de cocina —o el domicilio está para despachar—: la
 *    cuenta ya no va a crecer y puede cobrarse en cuanto la pidan.
 * 3. **En curso.** Todavía están comiendo. Se ve para saber cuánta plata hay en
 *    el piso, no para cobrarla ahora.
 */
export type EstadoDeCobro = "PIDIO_CUENTA" | "LISTO" | "EN_CURSO";

/** Los tres grupos, en el orden en que se atienden. */
export const ESTADOS_EN_ORDEN = ["PIDIO_CUENTA", "LISTO", "EN_CURSO"] as const;

export const ORDEN_DE_COBRO: Record<EstadoDeCobro, number> = {
  PIDIO_CUENTA: 0,
  LISTO: 1,
  EN_CURSO: 2,
};

export const ETIQUETA_DE_COBRO: Record<EstadoDeCobro, string> = {
  PIDIO_CUENTA: "Pidió la cuenta",
  LISTO: "Listo para cobrar",
  EN_CURSO: "En curso",
};

export function estadoDeCobro(pedido: {
  status: string;
  deliveryStatus: string | null;
  /** Los renglones vivos, con su estado de cocina. */
  items: readonly { status: string }[];
}): EstadoDeCobro {
  if (pedido.status === "CUENTA_PEDIDA") return "PIDIO_CUENTA";

  if (
    pedido.deliveryStatus !== null &&
    (DOMICILIOS_COBRABLES as readonly string[]).includes(pedido.deliveryStatus)
  ) {
    return "LISTO";
  }

  // Sin renglones vivos no hay nada que esperar de la cocina; con todos servidos,
  // tampoco. En los dos casos la cuenta ya no va a crecer sola.
  const vivos = pedido.items.filter((i) => i.status !== "ANULADO");
  const todoServido =
    vivos.length > 0 && vivos.every((i) => i.status === "LISTO" || i.status === "ENTREGADO");

  return todoServido ? "LISTO" : "EN_CURSO";
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
