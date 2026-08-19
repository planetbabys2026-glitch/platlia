/**
 * La comanda de cocina, en líneas de ancho fijo.
 *
 * No existía: el proyecto solo sabía componer el recibo del cliente, y la comanda
 * vivía únicamente en la pantalla del KDS. Un bar sin pantalla en la cocina no
 * tenía forma de que el pedido llegara a la plancha.
 *
 * Una comanda **no es un recibo con otro título**. No lleva precios ni impuestos:
 * quien cocina necesita qué, cuánto y cómo, y todo lo demás le estorba. Lo que sí
 * lleva, grande, es lo que se busca de lejos con el papel en la mano: el número de
 * turno o la mesa.
 *
 * Módulo puro, con tests.
 */

import { centrar, envolver, separador } from "@/lib/printing/ticket";
import { formatDateTimeInTimeZone } from "@/lib/time";

export type ItemDeComanda = {
  quantity: number;
  nameSnapshot: string;
  notes: string | null;
  modifiers: { optionNameSnapshot: string }[];
};

export type PedidoDeComanda = {
  code: number;
  type: string;
  turnNumber: number | null;
  customerName: string | null;
  deliveryAddress: string | null;
  openedAt: Date;
  table: { name: string } | null;
};

export type OpcionesDeComanda = {
  ancho: number;
  zona: string;
  /** La estación a la que va este papel: "Cocina", "Barra", "Sin estación". */
  estacion: string;
  /** Cuántas líneas del principio se imprimen en letra grande. */
  destacadas?: number;
};

/**
 * Cuántas líneas iniciales van en grande.
 *
 * Es el identificador y nada más: en una plancha con seis comandas colgadas, lo
 * único que se busca de lejos es cuál es cuál.
 */
export const LINEAS_DESTACADAS_COMANDA = 1;

/** El renglón grande que identifica el pedido: mesa, turno o domicilio. */
function identificador(pedido: PedidoDeComanda): string {
  if (pedido.table) return `MESA ${pedido.table.name}`;
  if (pedido.type === "DOMICILIO") return `DOMICILIO #${pedido.code}`;
  if (pedido.turnNumber !== null) return `TURNO ${pedido.turnNumber}`;
  return `PEDIDO #${pedido.code}`;
}

export function componerComanda(
  pedido: PedidoDeComanda,
  items: readonly ItemDeComanda[],
  opciones: OpcionesDeComanda,
): string[] {
  const { ancho, zona, estacion } = opciones;

  const lineas: string[] = [];
  const push = (...ls: string[]) => lineas.push(...ls);

  // Va primero y solo: `componerEscPos` imprime en grande las primeras N líneas,
  // así que el identificador tiene que ser la línea 1.
  push(centrar(identificador(pedido), Math.floor(ancho / 2)));

  push(separador(ancho, "="));
  push(estacion.toUpperCase());
  push(formatDateTimeInTimeZone(pedido.openedAt, zona));
  if (pedido.customerName) push(...envolver(pedido.customerName, ancho));
  // La dirección va en la comanda del domicilio porque es lo que arma el paquete:
  // quien empaca necesita saber si es para llevar antes de terminar de plegarlo.
  if (pedido.type === "DOMICILIO" && pedido.deliveryAddress) {
    push(...envolver(`Dir: ${pedido.deliveryAddress}`, ancho));
  }
  push(separador(ancho, "="));

  for (const item of items) {
    // La cantidad va pegada al nombre y sin precio: en una comanda el número que
    // importa es cuántos, no cuánto.
    push(...envolver(`${item.quantity}x ${item.nameSnapshot}`, ancho));

    for (const mod of item.modifiers) {
      push(...envolver(`  - ${mod.optionNameSnapshot}`, ancho));
    }
    // Las notas van marcadas: "sin cebolla" perdido entre renglones es un plato
    // que vuelve.
    if (item.notes) {
      push(...envolver(`  >> ${item.notes}`, ancho));
    }
    push("");
  }

  push(separador(ancho));
  push(centrar(`Pedido #${pedido.code}`, ancho));

  return lineas;
}
