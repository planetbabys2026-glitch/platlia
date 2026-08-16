import type { OrderStatus, TableStatus } from "@/generated/prisma/enums";

/**
 * El estado de una mesa como resumen de sus cuentas.
 *
 * Una mesa puede tener varias cuentas abiertas al mismo tiempo: un grupo que
 * llega junto y pide por separado abre una por persona, y el QR de la mesa abre
 * una más cada vez que alguien manda un pedido desde su celular. Por eso
 * `Table.status` no lo decide el último pedido que se tocó, sino todos los que
 * siguen vivos: cobrar una de tres cuentas no puede liberar la mesa.
 *
 * Módulo puro para que esto tenga tests: la regla es corta, pero equivocarse
 * significa una mesa que se ve libre con gente sentada, y eso se descubre cuando
 * el mesero sienta a otros encima.
 */

/**
 * `INACTIVA` no se toca nunca: una mesa fuera de servicio la marcó una persona y
 * solo una persona la devuelve. `RESERVADA`, en cambio, sí se pierde al quedar
 * todo cerrado —la reserva se consumió cuando la gente se sentó y se fue—.
 */
export function estadoDeMesa(
  actual: TableStatus,
  pedidos: readonly { status: OrderStatus }[],
): TableStatus {
  if (actual === "INACTIVA") return "INACTIVA";

  const vivos = pedidos.filter((p) => p.status === "ABIERTA" || p.status === "CUENTA_PEDIDA");
  if (vivos.length === 0) return "LIBRE";

  // Basta con que una cuenta haya pedido la cuenta para que la mesa lo anuncie:
  // es lo que hace que el cajero la vea en su lista y el mesero sepa que alguien
  // está esperando el tiquete.
  return vivos.some((p) => p.status === "CUENTA_PEDIDA") ? "CUENTA_PEDIDA" : "OCUPADA";
}

/**
 * Cómo se llama una cuenta en pantalla.
 *
 * El nombre lo escribe quien atiende ("Andrés") o quien pide por el QR. Cuando no
 * hay ninguno se usa el ordinal, que es lo que la gente ya dice en voz alta: "la
 * dos de la mesa doce".
 */
export function etiquetaDeCuenta(customerName: string | null | undefined, indice: number): string {
  const nombre = customerName?.trim();
  return nombre ? nombre : `Cuenta ${indice}`;
}
