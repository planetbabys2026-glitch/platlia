/**
 * Pesos colombianos, siempre enteros.
 *
 * En Colombia no circulan centavos: el peso es la unidad mínima y la moneda más
 * chica en circulación es de $50. Por eso acá no hay decimales en ninguna parte
 * —ni float, ni Decimal, ni "centavos"— y cualquier valor fraccionario es un bug
 * que este módulo hace explotar en vez de arrastrar.
 *
 * Módulo puro: no importa nada, así que corre igual en el servidor, en el
 * navegador y en los tests.
 */

/** Un monto en pesos colombianos enteros. */
export type Cop = number;

export function assertCop(value: number, nombre = "el monto"): Cop {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${nombre} debe ser un número finito, llegó ${value}.`);
  }
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${nombre} debe ser un entero en pesos, llegó ${value}. El peso colombiano no tiene centavos.`,
    );
  }
  return value;
}

/** Separa los miles con punto, como se escribe la moneda en Colombia. */
function agruparMiles(entero: number): string {
  return Math.abs(entero)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formatea para mostrar: 18900 → "$18.900", -500 → "-$500".
 *
 * No usa Intl a propósito. `Intl.NumberFormat("es-CO")` mete un espacio duro
 * entre el símbolo y la cifra y su salida cambia entre versiones de ICU, lo que
 * descuadraría los tiquetes térmicos —que se componen a 32 o 48 caracteres por
 * línea— y volvería frágiles los tests.
 */
export function formatCop(amountCop: Cop, options?: { symbol?: boolean }): string {
  assertCop(amountCop);
  const conSimbolo = options?.symbol ?? true;
  const signo = amountCop < 0 ? "-" : "";
  return `${signo}${conSimbolo ? "$" : ""}${agruparMiles(amountCop)}`;
}

/**
 * Lee lo que escribió una persona: "$ 18.900", "18900", "18.900" → 18900.
 *
 * Descarta todo lo que no sea dígito o el signo menos inicial. Como el peso no
 * tiene centavos, tanto el punto como la coma se tratan como separador de miles:
 * "18.5" se lee 185, no 18,5. Devuelve null si no queda ningún dígito.
 */
export function parseCop(input: string): Cop | null {
  const limpio = input.trim();
  if (limpio === "") return null;

  const negativo = limpio.startsWith("-");
  const digitos = limpio.replace(/\D/g, "");
  if (digitos === "") return null;

  const valor = Number.parseInt(digitos, 10);
  if (!Number.isSafeInteger(valor)) return null;

  return negativo ? -valor : valor;
}

/**
 * Redondea al múltiplo más cercano, alejándose del cero en el empate.
 *
 * Se usa para el efectivo: si el negocio no tiene monedas por debajo de $50, un
 * total de $18.925 se cobra $18.950. Es una regla de PAGO, no de facturación: el
 * total del pedido nunca se toca.
 */
export function roundCopTo(amountCop: Cop, stepCop: number): Cop {
  assertCop(amountCop);
  assertCop(stepCop, "el múltiplo de redondeo");
  if (stepCop <= 1) return amountCop;

  const signo = amountCop < 0 ? -1 : 1;
  return signo * Math.round(Math.abs(amountCop) / stepCop) * stepCop;
}

/** Suma montos validando que todos sean enteros. */
export function sumCop(amounts: readonly Cop[]): Cop {
  return amounts.reduce<Cop>((total, monto) => total + assertCop(monto), 0);
}

/**
 * Aplica una tasa en puntos básicos: 800 = 8%. Redondea al peso.
 * Es la única multiplicación por porcentaje que debería existir en el proyecto.
 */
export function applyRateBp(amountCop: Cop, rateBp: number): Cop {
  assertCop(amountCop);
  assertCop(rateBp, "la tasa en puntos básicos");
  return Math.round((amountCop * rateBp) / 10_000);
}

/**
 * Reparte un total entre N cuentas sin perder ni inventar un peso.
 *
 * Dividir $10.000 entre 3 y redondear cada parte da $3.333 × 3 = $9.999: falta un
 * peso y la caja no cuadra. Acá el sobrante se reparte de a uno entre las primeras
 * partes, así que la suma del arreglo siempre es exactamente el total.
 */
export function splitCop(totalCop: Cop, parts: number): Cop[] {
  assertCop(totalCop);
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`No se puede dividir entre ${parts} partes.`);
  }

  const signo = totalCop < 0 ? -1 : 1;
  const absoluto = Math.abs(totalCop);
  const base = Math.floor(absoluto / parts);
  const sobrante = absoluto - base * parts;

  return Array.from({ length: parts }, (_, i) =>
    signo * (base + (i < sobrante ? 1 : 0)),
  );
}

/**
 * Promedio en pesos enteros: el ticket promedio de la jornada.
 *
 * Devuelve 0 cuando no hubo ventas, en vez de NaN: un informe con "NaN" en el
 * ticket promedio hace dudar del resto de las cifras, aunque estén bien.
 */
export function promedioCop(totalCop: Cop, cantidad: number): Cop {
  assertCop(totalCop);
  if (!Number.isInteger(cantidad) || cantidad <= 0) return 0;
  return Math.round(totalCop / cantidad);
}

/**
 * Cuánto cambió una cifra respecto de otra, en porcentaje redondeado.
 *
 * Devuelve null si la base es cero: pasar de $0 a $500.000 no es "un aumento del
 * infinito por ciento", es un dato que no admite porcentaje y la pantalla tiene
 * que decir otra cosa.
 */
export function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 100);
}

/**
 * Qué porción de la venta se queda el negocio, en porcentaje redondeado.
 *
 * Devuelve null si no hubo venta, con el mismo criterio que
 * `variacionPorcentual`: sin base no hay porcentaje, y un 0% inventado se lee
 * como "vendimos a pérdida" cuando en realidad no se vendió nada.
 *
 * La venta que va acá es la **base gravable**, no el total: el impuesto se cobra
 * para entregarlo, así que contarlo como ingreso propio infla el margen de todo
 * el negocio en un 8%.
 */
export function margenPorcentual(utilidadCop: number, ventaCop: number): number | null {
  if (ventaCop === 0) return null;
  return Math.round((utilidadCop / Math.abs(ventaCop)) * 100);
}

/** Muestra una tasa en puntos básicos como porcentaje: 800 → "8%", 850 → "8,5%". */
export function formatRateBp(rateBp: number): string {
  assertCop(rateBp, "la tasa en puntos básicos");
  const porcentaje = rateBp / 100;
  return `${porcentaje.toString().replace(".", ",")}%`;
}
