import { TZDate } from "@date-fns/tz";

/**
 * Fechas y día de negocio.
 *
 * Ninguna fecha de este proyecto es ingenua. Dos ideas distintas conviven acá:
 *
 *  · Un INSTANTE (cuándo pasó algo) es un `Date` real, que en la base es
 *    `@db.Timestamptz(3)`.
 *  · Un DÍA DE NEGOCIO (a qué jornada pertenece) es una fecha de calendario sin
 *    hora, que en la base es `@db.Date`. Se representa como un `Date` puesto en la
 *    medianoche UTC de ese día, que es exactamente lo que el driver escribe en una
 *    columna DATE.
 *
 * El día de negocio no empieza a medianoche: un bar que cierra a las 3 a.m. tiene
 * que ver esas ventas en la jornada anterior, o el cierre de caja nunca cuadra.
 * Por eso cada empresa define su corte (`businessDayStartMinutes`) y su zona
 * horaria, y todo cálculo pasa por acá.
 *
 * Corolario: está prohibido derivar el día en SQL con CURRENT_DATE o now()::date.
 * El servidor de base de datos no sabe en qué zona vive el negocio ni a qué hora
 * corta su jornada. El businessDate siempre viaja como parámetro.
 *
 * Módulo puro: solo depende de @date-fns/tz.
 */

/** Los dos parámetros de tiempo de una empresa, con los nombres de BusinessSettings. */
export type BusinessTimeSettings = {
  timeZone: string;
  businessDayStartMinutes: number;
};

const MINUTO_MS = 60_000;
const DIA_MS = 86_400_000;

export function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    throw new RangeError(`"${timeZone}" no es una zona horaria IANA válida.`);
  }
}

function assertCorte(minutos: number): number {
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1439) {
    throw new RangeError(
      `El corte del día debe ser un entero entre 0 y 1439 minutos, llegó ${minutos}.`,
    );
  }
  return minutos;
}

function dosDigitos(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * A qué día de negocio pertenece un instante.
 *
 * Devuelve la medianoche UTC del día de calendario correspondiente, listo para
 * escribirse en una columna DATE.
 */
export function businessDateFor(instant: Date, settings: BusinessTimeSettings): Date {
  const timeZone = assertTimeZone(settings.timeZone);
  const corte = assertCorte(settings.businessDayStartMinutes);

  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("businessDateFor recibió una fecha inválida.");
  }

  // Se corre el reloj hacia atrás tantos minutos como dure la madrugada que
  // todavía cuenta como el día anterior; después basta con leer el calendario
  // local resultante.
  const local = new TZDate(instant.getTime() - corte * MINUTO_MS, timeZone);

  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** El día de negocio en curso ahora mismo. */
export function currentBusinessDate(settings: BusinessTimeSettings, now = new Date()): Date {
  return businessDateFor(now, settings);
}

/**
 * El intervalo de instantes que cubre un día de negocio: `[start, end)`.
 *
 * Es lo que va en el `where` de cualquier informe. El extremo derecho es abierto
 * a propósito: usar `lte` con el final del día deja afuera o adentro los eventos
 * del último milisegundo según cómo se haya construido, y esa clase de error solo
 * aparece cuando alguien reclama por una venta que no salió en el corte.
 */
export function businessDayRange(
  businessDate: Date,
  settings: BusinessTimeSettings,
): { start: Date; end: Date } {
  const timeZone = assertTimeZone(settings.timeZone);
  const corte = assertCorte(settings.businessDayStartMinutes);

  const inicio = instanteDeCorte(businessDate, timeZone, corte);
  const siguiente = new Date(businessDate.getTime() + DIA_MS);
  const fin = instanteDeCorte(siguiente, timeZone, corte);

  return { start: inicio, end: fin };
}

function instanteDeCorte(businessDate: Date, timeZone: string, corte: number): Date {
  const zonificado = new TZDate(
    businessDate.getUTCFullYear(),
    businessDate.getUTCMonth(),
    businessDate.getUTCDate(),
    Math.floor(corte / 60),
    corte % 60,
    0,
    0,
    timeZone,
  );

  return new Date(zonificado.getTime());
}

/** Si dos instantes caen en la misma jornada. */
export function isSameBusinessDay(
  a: Date,
  b: Date,
  settings: BusinessTimeSettings,
): boolean {
  return businessDateFor(a, settings).getTime() === businessDateFor(b, settings).getTime();
}

/** Un día de negocio como "2026-08-04", para claves, URLs y filtros. */
export function formatBusinessDate(businessDate: Date): string {
  return `${businessDate.getUTCFullYear()}-${dosDigitos(businessDate.getUTCMonth() + 1)}-${dosDigitos(businessDate.getUTCDate())}`;
}

/** El inverso de formatBusinessDate. Rechaza cualquier cosa que no sea YYYY-MM-DD. */
export function parseBusinessDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new RangeError(`"${iso}" no es un día de negocio con formato YYYY-MM-DD.`);
  }

  const [, anio, mes, dia] = match;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));

  if (formatBusinessDate(fecha) !== iso) {
    throw new RangeError(`"${iso}" no es una fecha existente.`);
  }

  return fecha;
}

/**
 * Formatea un instante en la zona de la empresa.
 *
 * Escrito a mano y no con Intl: estas cadenas van al tiquete térmico, que se
 * compone a un ancho fijo, y la salida de Intl cambia entre versiones de ICU.
 */
export function formatDayInTimeZone(instant: Date, timeZone: string): string {
  const local = new TZDate(instant, assertTimeZone(timeZone));
  return `${local.getFullYear()}-${dosDigitos(local.getMonth() + 1)}-${dosDigitos(local.getDate())}`;
}

export function formatTimeInTimeZone(instant: Date, timeZone: string): string {
  const local = new TZDate(instant, assertTimeZone(timeZone));
  return `${dosDigitos(local.getHours())}:${dosDigitos(local.getMinutes())}`;
}

export function formatDateTimeInTimeZone(instant: Date, timeZone: string): string {
  return `${formatDayInTimeZone(instant, timeZone)} ${formatTimeInTimeZone(instant, timeZone)}`;
}
