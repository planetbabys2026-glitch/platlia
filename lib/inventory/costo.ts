/**
 * El costo, que es la mitad que faltaba para poder hablar de ganancia.
 *
 * Puro y sin `server-only`, por el mismo motivo que `receta.ts`: lo usa la
 * factura de compra en el servidor y también la pantalla que anticipa el margen
 * de un producto antes de guardarlo.
 */

import type { RenglonDeReceta } from "@/lib/inventory/receta";

/**
 * El costo unitario después de una entrada de mercadería.
 *
 * Promedio ponderado, no "último costo". Con último costo, comprar diez cervezas
 * caras un martes reevalúa las veinte baratas que ya estaban en la nevera: el
 * inventario vale de golpe una plata que nadie pagó, y el margen de la semana
 * salta sin que haya pasado nada en el negocio.
 *
 * Dos casos que no son promedio y hay que tratar aparte:
 *
 * - **Sin costo previo.** Un `costCop` en cero casi nunca significa "me lo
 *   regalaron": significa que ese insumo se cargó a mano y nadie le puso precio.
 *   Promediar contra ese cero arrastraría el costo nuevo hacia abajo a ciegas, así
 *   que se adopta el entrante entero.
 * - **Stock en cero o negativo.** No hay nada que ponderar del lado viejo. El
 *   negativo además es normal ahora: sale de una venta con `permitirVentaSinStock`.
 */
export function costoPromedioPonderado(
  stockActual: number,
  costoActual: number,
  cantidadEntrante: number,
  costoEntrante: number,
): number {
  const entrante = Math.max(0, Math.round(cantidadEntrante));
  const costoNuevo = Math.max(0, Math.round(costoEntrante));

  if (entrante <= 0) return Math.max(0, Math.round(costoActual));

  const existente = Math.max(0, Math.round(stockActual));
  const costoViejo = Math.max(0, Math.round(costoActual));

  if (existente <= 0 || costoViejo <= 0) return costoNuevo;

  const valorTotal = existente * costoViejo + entrante * costoNuevo;
  return Math.round(valorTotal / (existente + entrante));
}

/**
 * Lo que cuesta preparar UNA porción de una receta ya compuesta.
 *
 * `null` cuando la receta está vacía, con el mismo criterio que
 * `porcionesSegunReceta`: no es "cuesta cero", es "este producto no se costea por
 * insumos". Cero y `null` terminan en lugares muy distintos — cero llega al
 * informe como margen del 100%.
 */
export function costoDeReceta(receta: RenglonDeReceta[]): number | null {
  if (receta.length === 0) return null;

  let total = 0;
  for (const renglon of receta) {
    total += renglon.quantityRequired * (renglon.inventoryItem.costCop ?? 0);
  }

  return Math.max(0, Math.round(total));
}

/**
 * El costo de un renglón vendido, en la forma en que se congela en `OrderItem`.
 *
 * Devuelve `null` —y no cero— cuando no hay de dónde sacar un costo: el negocio
 * no lleva inventario, o el producto no tiene ni receta ni costo cargado. Eso es
 * lo que después deja al informe decir "estas ventas no tienen costo" en vez de
 * anunciar una utilidad que no calculó nadie.
 */
export function costoUnitarioDeVenta(input: {
  trackStock: boolean;
  costCop: number;
  receta: RenglonDeReceta[];
}): number | null {
  const porReceta = costoDeReceta(input.receta);
  if (porReceta !== null) return porReceta;

  if (input.trackStock && input.costCop > 0) return Math.round(input.costCop);

  return null;
}
