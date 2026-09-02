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
 * **Se imprime entera a doble alto y en mayúsculas.** No es una preferencia
 * estética: esto se lee de pie, a un metro, con las manos ocupadas y a veces con
 * vapor de por medio. El tamaño lo pone `componerEscPos` con `dobleAlto`; la caja
 * alta, este módulo.
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
  /**
   * Quién tomó el pedido.
   *
   * Va en el papel porque es a quien la cocina llama cuando algo no cuadra —"esto
   * dice sin cebolla, ¿es de la 4?"— y porque un plato que sale mal tiene que
   * poder rastrearse hasta quien lo cantó. Con seis comandas colgadas, "preguntale
   * al mesero" no alcanza.
   */
  openedBy: { name: string } | null;
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
  if (pedido.openedBy) push(...envolver(`Mesero: ${pedido.openedBy.name}`, ancho));
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

  /**
   * Todo en mayúsculas, al final y de una sola pasada.
   *
   * Una térmica imprime chico y con poco contraste, y esto se lee de pie, a un
   * metro, con las manos ocupadas. La caja alta es más legible en ese contexto —no
   * hay descendentes que se corten ni minúsculas que se empasten— y de paso hace
   * que un nombre de plato escrito con mayúscula inicial y otro todo en minúscula
   * se vean iguales en el papel.
   *
   * Se aplica acá y no en cada `push` para que ninguna línea futura se olvide, y
   * después de componer para que `centrar` y `envolver` hayan medido sobre el
   * texto real: en español la caja alta no cambia el largo, así que las columnas
   * siguen cuadrando. CP858 tiene Á É Í Ó Ú Ñ, y `escpos.ts` ya las mapea.
   */
  return lineas.map((linea) => linea.toUpperCase());
}
