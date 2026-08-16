import type { ListaDePrecios } from "@/lib/billing/precios";

/**
 * Cuánto cuesta sumar una sede a mitad de un período ya pagado.
 *
 * Cobrar el mes entero a quien agrega una sede el día 25 es cobrarle cinco días
 * de servicio a precio de treinta, y cobrarle cero es regalarlos: se cobra la
 * parte proporcional de lo que falta y desde la renovación siguiente la licencia
 * ya vale lo que vale con la sede nueva.
 *
 * Antes este módulo tenía su propia matriz de ocho precios escritos a mano —que
 * no coincidía con ninguna otra del repo— y una rama por cada periodicidad. Ahora
 * sale de la lista de precios y de las fechas reales del período, así que funciona
 * igual para un plan mensual que para uno anual sin saber cuál es.
 *
 * Módulo puro, con tests.
 */

const MS_POR_DIA = 86_400_000;

export type Prorrateo = {
  /** Lo que se cobra ahora por lo que queda del período. */
  montoCop: number;
  diasRestantes: number;
  diasTotales: number;
  /** Lo que costaba la licencia por mes antes de sumar la sede. */
  mensualAntesCop: number;
  /** Lo que va a costar por mes desde la próxima renovación. */
  mensualDesdeAhoraCop: number;
};

export function prorratearSedeNueva({
  lista,
  sedesActuales,
  inicioPeriodo,
  finPeriodo,
  ahora = new Date(),
}: {
  lista: ListaDePrecios;
  /** Cuántas sedes tiene hoy, antes de sumar la nueva. */
  sedesActuales: number;
  inicioPeriodo: Date | null;
  finPeriodo: Date | null;
  ahora?: Date;
}): Prorrateo {
  const mensualAntesCop =
    lista.precioSedePrincipalCop + lista.precioSedeAdicionalCop * Math.max(0, sedesActuales - 1);
  const mensualDesdeAhoraCop = mensualAntesCop + lista.precioSedeAdicionalCop;

  // Sin período no hay nada que prorratear: se cobra el mes de la sede nueva.
  if (!inicioPeriodo || !finPeriodo) {
    return {
      montoCop: lista.precioSedeAdicionalCop,
      diasRestantes: 0,
      diasTotales: 0,
      mensualAntesCop,
      mensualDesdeAhoraCop,
    };
  }

  const diasTotales = Math.max(1, Math.ceil((finPeriodo.getTime() - inicioPeriodo.getTime()) / MS_POR_DIA));
  const diasRestantes = Math.max(0, Math.ceil((finPeriodo.getTime() - ahora.getTime()) / MS_POR_DIA));

  // Ya venció: no se cobra prorrateo. Lo que corresponde es renovar, y ahí la
  // sede nueva ya entra en el precio del período completo. Cobrar acá sería
  // cobrar por días que no existen.
  if (diasRestantes === 0) {
    return { montoCop: 0, diasRestantes: 0, diasTotales, mensualAntesCop, mensualDesdeAhoraCop };
  }

  // El costo del período completo por la sede que se agrega, proporcional a lo
  // que falta. Se calcula sobre el período real —no sobre "un mes"— así que un
  // plan anual prorratea sobre sus 365 días sin ningún caso especial.
  const costoDelPeriodoCop = Math.round((lista.precioSedeAdicionalCop * diasTotales) / 30);
  const montoCop = Math.round((costoDelPeriodoCop * diasRestantes) / diasTotales);

  return { montoCop, diasRestantes, diasTotales, mensualAntesCop, mensualDesdeAhoraCop };
}
