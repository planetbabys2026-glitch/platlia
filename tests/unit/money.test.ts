import { describe, expect, it } from "vitest";
import {
  applyRateBp,
  assertCop,
  formatCop,
  formatRateBp,
  parseCop,
  roundCopTo,
  splitCop,
  sumCop,
} from "@/lib/money";

describe("formatCop", () => {
  it("separa los miles con punto, como se escribe en Colombia", () => {
    expect(formatCop(18900)).toBe("$18.900");
    expect(formatCop(1234567)).toBe("$1.234.567");
    expect(formatCop(999)).toBe("$999");
    expect(formatCop(0)).toBe("$0");
  });

  it("pone el signo antes del símbolo", () => {
    expect(formatCop(-18900)).toBe("-$18.900");
  });

  it("puede omitir el símbolo, para alinear columnas del tiquete", () => {
    expect(formatCop(18900, { symbol: false })).toBe("18.900");
  });

  it("no emite espacios duros ni caracteres invisibles", () => {
    // Intl.NumberFormat("es-CO") mete un U+00A0 entre el símbolo y la cifra, que
    // descuadra el tiquete térmico. Esta es la razón de formatear a mano.
    expect(formatCop(18900)).not.toMatch(/\s/);
  });
});

describe("parseCop", () => {
  it("lee lo que escribe una persona", () => {
    expect(parseCop("18900")).toBe(18900);
    expect(parseCop("18.900")).toBe(18900);
    expect(parseCop("$ 18.900")).toBe(18900);
    expect(parseCop("  $1.234.567  ")).toBe(1234567);
  });

  it("trata punto y coma como separador de miles, porque el peso no tiene centavos", () => {
    expect(parseCop("18,900")).toBe(18900);
  });

  it("respeta el signo negativo", () => {
    expect(parseCop("-500")).toBe(-500);
  });

  it("devuelve null cuando no hay ningún dígito", () => {
    expect(parseCop("")).toBeNull();
    expect(parseCop("   ")).toBeNull();
    expect(parseCop("abc")).toBeNull();
    expect(parseCop("$")).toBeNull();
  });
});

describe("assertCop", () => {
  it("rechaza los decimales, que en pesos siempre son un bug", () => {
    expect(() => assertCop(1500.5)).toThrow(TypeError);
  });

  it("rechaza NaN e infinitos", () => {
    expect(() => assertCop(Number.NaN)).toThrow(TypeError);
    expect(() => assertCop(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe("roundCopTo", () => {
  it("redondea al múltiplo más cercano", () => {
    expect(roundCopTo(18925, 50)).toBe(18950);
    expect(roundCopTo(18924, 50)).toBe(18900);
    expect(roundCopTo(18900, 50)).toBe(18900);
  });

  it("en el empate se aleja del cero", () => {
    expect(roundCopTo(25, 50)).toBe(50);
    expect(roundCopTo(-25, 50)).toBe(-50);
  });

  it("con múltiplo 1 o menor no toca el monto", () => {
    expect(roundCopTo(18923, 1)).toBe(18923);
    expect(roundCopTo(18923, 0)).toBe(18923);
  });
});

describe("applyRateBp", () => {
  it("interpreta la tasa en puntos básicos", () => {
    expect(applyRateBp(17500, 800)).toBe(1400);
    expect(applyRateBp(10000, 1900)).toBe(1900);
    expect(applyRateBp(10000, 0)).toBe(0);
  });

  it("redondea al peso", () => {
    expect(applyRateBp(4630, 800)).toBe(370);
  });
});

describe("splitCop", () => {
  it("reparte sin perder ni inventar pesos", () => {
    const partes = splitCop(10000, 3);
    expect(partes).toEqual([3334, 3333, 3333]);
    expect(sumCop(partes)).toBe(10000);
  });

  it("reparte exacto cuando divide", () => {
    expect(splitCop(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it("mantiene la propiedad con montos y divisores arbitrarios", () => {
    for (const total of [1, 7, 999, 18900, 1234567]) {
      for (const partes of [1, 2, 3, 4, 7, 11]) {
        expect(sumCop(splitCop(total, partes))).toBe(total);
      }
    }
  });

  it("rechaza divisores inválidos", () => {
    expect(() => splitCop(10000, 0)).toThrow(RangeError);
    expect(() => splitCop(10000, 2.5)).toThrow(RangeError);
  });
});

describe("formatRateBp", () => {
  it("muestra la tasa como porcentaje con coma decimal", () => {
    expect(formatRateBp(800)).toBe("8%");
    expect(formatRateBp(1900)).toBe("19%");
    expect(formatRateBp(850)).toBe("8,5%");
    expect(formatRateBp(0)).toBe("0%");
  });
});
