import { assertCop, type Cop } from "@/lib/money";

/**
 * Cálculo de impuesto.
 *
 * Dos reglas gobiernan este módulo y no se negocian:
 *
 *  1. El impuesto se redondea POR LÍNEA, nunca sobre el total. Si se redondeara al
 *     final, el tiquete mostraría renglones que no suman lo que dice el total y no
 *     hay forma de explicárselo a un cliente ni a la DIAN.
 *  2. La tarifa se congela en el OrderItem al agregarlo. Este módulo solo recibe
 *     números; nunca va a buscar la tarifa vigente por su cuenta.
 *
 * En Colombia la carta se publica con el impuesto incluido —el cliente ve $18.900
 * y paga $18.900—, así que el caso normal es desagregar hacia atrás. El caso
 * contrario existe igual porque algunos negocios cotizan sin impuesto.
 *
 * Módulo puro: solo depende de lib/money.ts.
 */

export type TaxLineInput = {
  /** Precio unitario de lista, tal como quedó congelado en el renglón. */
  unitPriceCop: Cop;
  quantity: number;
  /** Tarifa en puntos básicos: 800 = 8%. */
  taxRateBp: number;
  /** Si el precio unitario ya trae el impuesto adentro. */
  taxIncluded: boolean;
  /** Descuento sobre la línea, en pesos. Se aplica antes de desagregar. */
  discountCop?: Cop;
};

export type TaxLine = {
  /** Base gravable: lo que se cobra sin impuesto. */
  lineSubtotalCop: Cop;
  lineTaxCop: Cop;
  /** Lo que efectivamente paga el cliente por esta línea. */
  lineTotalCop: Cop;
};

/**
 * Calcula una línea del pedido.
 *
 * Con impuesto incluido: base = total × 10000 / (10000 + tarifa), y el impuesto es
 * la diferencia. Se saca por diferencia y no con una segunda multiplicación para
 * que base + impuesto dé exactamente el total, sin un peso de descuadre por
 * redondeo.
 */
export function computeTaxLine(input: TaxLineInput): TaxLine {
  const { unitPriceCop, quantity, taxRateBp, taxIncluded } = input;

  assertCop(unitPriceCop, "el precio unitario");
  assertCop(taxRateBp, "la tarifa en puntos básicos");

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`La cantidad debe ser un entero no negativo, llegó ${quantity}.`);
  }
  if (taxRateBp < 0) {
    throw new RangeError(`La tarifa no puede ser negativa, llegó ${taxRateBp}.`);
  }

  const descuento = assertCop(input.discountCop ?? 0, "el descuento");
  const bruto = unitPriceCop * quantity;

  if (descuento > bruto) {
    throw new RangeError(
      `El descuento (${descuento}) no puede superar el valor de la línea (${bruto}).`,
    );
  }

  const neto = bruto - descuento;

  if (taxIncluded) {
    const base = Math.round((neto * 10_000) / (10_000 + taxRateBp));
    return {
      lineSubtotalCop: base,
      lineTaxCop: neto - base,
      lineTotalCop: neto,
    };
  }

  const impuesto = Math.round((neto * taxRateBp) / 10_000);
  return {
    lineSubtotalCop: neto,
    lineTaxCop: impuesto,
    lineTotalCop: neto + impuesto,
  };
}

export type OrderTotals = {
  subtotalCop: Cop;
  taxCop: Cop;
  totalCop: Cop;
};

/**
 * Suma líneas YA calculadas. No recalcula nada: los renglones vienen redondeados
 * de computeTaxLine y el total del pedido es su suma, no un redondeo nuevo.
 */
export function sumTaxLines(lines: readonly TaxLine[]): OrderTotals {
  return lines.reduce<OrderTotals>(
    (total, linea) => ({
      subtotalCop: total.subtotalCop + assertCop(linea.lineSubtotalCop),
      taxCop: total.taxCop + assertCop(linea.lineTaxCop),
      totalCop: total.totalCop + assertCop(linea.lineTotalCop),
    }),
    { subtotalCop: 0, taxCop: 0, totalCop: 0 },
  );
}

/**
 * Propina sugerida. En Colombia es voluntaria y hay que preguntarla antes de
 * sumarla, así que esto calcula la sugerencia y nada más: quien decide es la
 * persona.
 *
 * **Se calcula sobre el consumo COMPLETO, con impuesto incluido**: es el número
 * que el cliente ve en la cuenta, y el 10% que se le ofrece es sobre eso. Y la
 * propina en sí no lleva impuesto —entra al pedido como `Order.tipCop`, aparte de
 * los renglones, y en la factura electrónica viaja como una línea con tarifa
 * cero—.
 */
export function computeSuggestedTip(consumoCop: Cop, rateBp: number): Cop {
  assertCop(consumoCop, "el consumo");
  assertCop(rateBp, "la tasa de propina en puntos básicos");
  if (rateBp < 0) {
    throw new RangeError(`La propina no puede ser negativa, llegó ${rateBp}.`);
  }
  return Math.round((consumoCop * rateBp) / 10_000);
}
