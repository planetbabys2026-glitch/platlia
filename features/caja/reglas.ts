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
