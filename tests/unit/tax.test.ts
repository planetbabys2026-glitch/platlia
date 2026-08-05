import { describe, expect, it } from "vitest";
import { computeSuggestedTip, computeTaxLine, sumTaxLines } from "@/lib/tax";

const IMPOCONSUMO = 800;
const IVA = 1900;

describe("computeTaxLine con impuesto incluido en el precio", () => {
  it("desagrega hacia atrás y el total sigue siendo el precio de la carta", () => {
    // El cliente ve $18.900 en la carta y paga $18.900. El impuesto sale de adentro.
    const linea = computeTaxLine({
      unitPriceCop: 18900,
      quantity: 1,
      taxRateBp: IMPOCONSUMO,
      taxIncluded: true,
    });

    expect(linea).toEqual({
      lineSubtotalCop: 17500,
      lineTaxCop: 1400,
      lineTotalCop: 18900,
    });
  });

  it("base más impuesto da exactamente el total, incluso cuando no divide parejo", () => {
    const linea = computeTaxLine({
      unitPriceCop: 5000,
      quantity: 1,
      taxRateBp: IMPOCONSUMO,
      taxIncluded: true,
    });

    expect(linea.lineSubtotalCop).toBe(4630);
    expect(linea.lineTaxCop).toBe(370);
    expect(linea.lineSubtotalCop + linea.lineTaxCop).toBe(linea.lineTotalCop);
  });

  it("multiplica antes de desagregar", () => {
    const linea = computeTaxLine({
      unitPriceCop: 18900,
      quantity: 3,
      taxRateBp: IMPOCONSUMO,
      taxIncluded: true,
    });

    expect(linea).toEqual({
      lineSubtotalCop: 52500,
      lineTaxCop: 4200,
      lineTotalCop: 56700,
    });
  });
});

describe("computeTaxLine con impuesto por fuera del precio", () => {
  it("suma el impuesto sobre la base", () => {
    const linea = computeTaxLine({
      unitPriceCop: 10000,
      quantity: 1,
      taxRateBp: IVA,
      taxIncluded: false,
    });

    expect(linea).toEqual({
      lineSubtotalCop: 10000,
      lineTaxCop: 1900,
      lineTotalCop: 11900,
    });
  });
});

describe("descuentos", () => {
  it("se aplican antes de desagregar el impuesto", () => {
    const linea = computeTaxLine({
      unitPriceCop: 20000,
      quantity: 1,
      taxRateBp: IMPOCONSUMO,
      taxIncluded: true,
      discountCop: 5000,
    });

    expect(linea.lineTotalCop).toBe(15000);
    expect(linea.lineSubtotalCop + linea.lineTaxCop).toBe(15000);
  });

  it("no pueden superar el valor de la línea", () => {
    expect(() =>
      computeTaxLine({
        unitPriceCop: 10000,
        quantity: 1,
        taxRateBp: IMPOCONSUMO,
        taxIncluded: true,
        discountCop: 10001,
      }),
    ).toThrow(RangeError);
  });
});

describe("tarifa exenta", () => {
  it("no cobra impuesto en ninguno de los dos modos", () => {
    const incluido = computeTaxLine({
      unitPriceCop: 7000,
      quantity: 2,
      taxRateBp: 0,
      taxIncluded: true,
    });
    const porFuera = computeTaxLine({
      unitPriceCop: 7000,
      quantity: 2,
      taxRateBp: 0,
      taxIncluded: false,
    });

    expect(incluido).toEqual({
      lineSubtotalCop: 14000,
      lineTaxCop: 0,
      lineTotalCop: 14000,
    });
    expect(porFuera).toEqual(incluido);
  });
});

describe("el redondeo es por línea, nunca sobre el total", () => {
  it("tres renglones de $5.000 dan $1.110 de impuesto, no $1.111", () => {
    const renglon = {
      unitPriceCop: 5000,
      quantity: 1,
      taxRateBp: IMPOCONSUMO,
      taxIncluded: true,
    } as const;

    const totales = sumTaxLines([
      computeTaxLine(renglon),
      computeTaxLine(renglon),
      computeTaxLine(renglon),
    ]);

    expect(totales).toEqual({
      subtotalCop: 13890,
      taxCop: 1110,
      totalCop: 15000,
    });

    // El mismo consumo cargado como un solo renglón de tres unidades sí redondea
    // una vez y da un peso más de impuesto. Las dos cifras son correctas: lo que
    // no puede pasar es que el tiquete muestre una y sume la otra.
    const enUnaLinea = computeTaxLine({ ...renglon, quantity: 3 });
    expect(enUnaLinea.lineTaxCop).toBe(1111);
  });

  it("los renglones siempre suman el total del pedido", () => {
    const lineas = [
      computeTaxLine({ unitPriceCop: 18900, quantity: 2, taxRateBp: IMPOCONSUMO, taxIncluded: true }),
      computeTaxLine({ unitPriceCop: 5000, quantity: 3, taxRateBp: IMPOCONSUMO, taxIncluded: true }),
      computeTaxLine({ unitPriceCop: 3500, quantity: 1, taxRateBp: 0, taxIncluded: true }),
    ];

    const totales = sumTaxLines(lineas);
    expect(totales.subtotalCop + totales.taxCop).toBe(totales.totalCop);
  });
});

describe("validaciones", () => {
  it("rechaza cantidades y precios que no son enteros", () => {
    expect(() =>
      computeTaxLine({ unitPriceCop: 1000.5, quantity: 1, taxRateBp: 800, taxIncluded: true }),
    ).toThrow(TypeError);
    expect(() =>
      computeTaxLine({ unitPriceCop: 1000, quantity: 1.5, taxRateBp: 800, taxIncluded: true }),
    ).toThrow(RangeError);
    expect(() =>
      computeTaxLine({ unitPriceCop: 1000, quantity: -1, taxRateBp: 800, taxIncluded: true }),
    ).toThrow(RangeError);
  });

  it("rechaza tarifas negativas", () => {
    expect(() =>
      computeTaxLine({ unitPriceCop: 1000, quantity: 1, taxRateBp: -800, taxIncluded: true }),
    ).toThrow(RangeError);
  });
});

describe("computeSuggestedTip", () => {
  it("calcula la sugerencia sobre el consumo antes de impuesto", () => {
    expect(computeSuggestedTip(17500, 1000)).toBe(1750);
    expect(computeSuggestedTip(13890, 1000)).toBe(1389);
  });

  it("acepta que no haya propina sugerida", () => {
    expect(computeSuggestedTip(17500, 0)).toBe(0);
  });
});
