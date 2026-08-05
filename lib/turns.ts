/**
 * Numeración de turno: el número que se canta y se muestra en el televisor del
 * salón cuando el pedido está listo.
 *
 * No es el consecutivo del pedido. El consecutivo es contable, crece todo el día
 * y no se repite; el turno es para gritarlo, así que se mantiene corto y rota.
 * Con dos dígitos, "turno 47" se lee a dos metros; "turno 1.284" no.
 *
 * Rota dentro de la jornada: al llegar al tope vuelve a 1. Que se repita no es un
 * problema, porque para cuando vuelva a dar la vuelta el 47 anterior ya se lo
 * llevaron hace rato.
 *
 * Módulo puro, sin imports.
 */

export const TURNO_MAXIMO_POR_DEFECTO = 99;

/**
 * El turno que sigue. `ultimo` es el mayor entregado en la jornada, o null si es
 * el primero del día.
 */
export function siguienteTurno(ultimo: number | null, max = TURNO_MAXIMO_POR_DEFECTO): number {
  if (!Number.isInteger(max) || max < 1) {
    throw new RangeError(`El tope de turno debe ser un entero mayor o igual a 1, llegó ${max}.`);
  }
  if (ultimo === null || ultimo === undefined) return 1;
  if (!Number.isInteger(ultimo) || ultimo < 1) {
    throw new RangeError(`El último turno debe ser un entero positivo, llegó ${ultimo}.`);
  }
  // Un tope que bajó (de 99 a 50) deja turnos viejos por encima: se reinicia.
  if (ultimo >= max) return 1;
  return ultimo + 1;
}

/**
 * Con ceros a la izquierda hasta el ancho del tope: en el televisor las cifras
 * quedan alineadas y no saltan de lugar al pasar de 9 a 10.
 */
export function formatTurno(turno: number, max = TURNO_MAXIMO_POR_DEFECTO): string {
  return turno.toString().padStart(max.toString().length, "0");
}
