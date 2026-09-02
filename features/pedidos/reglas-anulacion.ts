/**
 * Qué se puede sacar de una cuenta, y qué hay que anular.
 *
 * Puro y compartido a propósito: la pantalla del salón y la acción del servidor
 * tienen que decidir **lo mismo**. Cuando cada una lo decidía por su cuenta, las
 * dos miraban `status` y las dos se equivocaban igual —lo cual es peor que
 * discrepar, porque no hay nada que lo delate—.
 */

/** Lo mínimo que hace falta saber de un renglón para decidir. */
export type RenglonParaDecidir = {
  status: string;
  /** Cuándo salió a la plancha. `null` es "todavía está en el carrito". */
  sentToKitchenAt: Date | string | null;
};

/**
 * Quitar es para el carrito. Lo que ya salió a cocina se anula, con motivo.
 *
 * **La condición es `sentToKitchenAt`, no el estado.** Un plato que ya salió a
 * la plancha sigue en `PENDIENTE` hasta que un cocinero toca "Empezar" —y en un
 * negocio que trabaja solo con papel nadie lo toca nunca—. Mirando el estado, el
 * mesero podía sacar de la cuenta, sin motivo y sin dejar rastro, un plato que ya
 * estaba cocinado y probablemente servido: la cuenta bajaba y el consumo no
 * volvía a aparecer en ningún lado.
 */
export function sePuedeQuitar(item: RenglonParaDecidir): boolean {
  return item.sentToKitchenAt === null && item.status === "PENDIENTE";
}

/**
 * Si hay que pedir la clave de anulación.
 *
 * Un pedido **vacío** no la pide aunque el negocio la tenga puesta: es una mesa
 * abierta por error, y pedirle una clave a quien se equivocó de mesa es la forma
 * más rápida de que las mesas fantasma se queden abiertas toda la noche —que es
 * justo el problema que la anulación viene a resolver—.
 */
export function pideClaveDeAnulacion(renglonesVivos: number, hayClave: boolean): boolean {
  return renglonesVivos > 0 && hayClave;
}
