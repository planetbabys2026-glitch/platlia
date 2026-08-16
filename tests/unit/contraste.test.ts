import { describe, expect, it } from "vitest";
import {
  acentoSirveComoTexto,
  leerHex,
  mezclarHacia,
  razonDeContraste,
  textoSobre,
} from "@/lib/contraste";

/**
 * Lo que decide si el precio de un plato se lee o no en el celular de un cliente
 * parado en la calle. El dueño elige el color del acento; nadie revisa después
 * si sobre ese color se puede escribir.
 */
describe("leerHex", () => {
  it("entiende las dos formas", () => {
    expect(leerHex("#FFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(leerHex("#FF4E1F")).toEqual({ r: 255, g: 78, b: 31 });
    expect(leerHex("ff4e1f")).toEqual({ r: 255, g: 78, b: 31 });
  });

  it("no inventa un color cuando le dan basura", () => {
    expect(leerHex("")).toBeNull();
    expect(leerHex("rojo")).toBeNull();
    expect(leerHex("#12345")).toBeNull();
  });
});

describe("razonDeContraste", () => {
  it("da los extremos conocidos", () => {
    const negro = { r: 0, g: 0, b: 0 };
    const blanco = { r: 255, g: 255, b: 255 };
    expect(razonDeContraste(negro, blanco)).toBeCloseTo(21, 1);
    expect(razonDeContraste(blanco, blanco)).toBeCloseTo(1, 5);
  });

  it("es simétrica: no importa cuál va de fondo", () => {
    const a = { r: 255, g: 78, b: 31 };
    const b = { r: 23, g: 21, b: 18 };
    expect(razonDeContraste(a, b)).toBeCloseTo(razonDeContraste(b, a), 10);
  });
});

describe("textoSobre", () => {
  it("elige tinta sobre los acentos claros y papel sobre los oscuros", () => {
    // Brasa y el ámbar del preset Espresso son claros: encima va la tinta.
    expect(textoSobre("#FF4E1F")).toBe("#171512");
    expect(textoSobre("#D97706")).toBe("#171512");
    // El azul del preset Titanio es claro; el verde Esmeralda también.
    expect(textoSobre("#38BDF8")).toBe("#171512");
    expect(textoSobre("#10B981")).toBe("#171512");
    // Un acento realmente oscuro pide papel.
    expect(textoSobre("#1D2A4A")).toBe("#EDE7DA");
    expect(textoSobre("#000000")).toBe("#EDE7DA");
  });

  it("ante un color ilegible no deja el texto invisible", () => {
    expect(textoSobre("no-es-un-color")).toBe("#EDE7DA");
  });
});

describe("acentoSirveComoTexto", () => {
  const fondo = "#171512"; // --tinta, el fondo por defecto del menú

  it("acepta los acentos que de verdad se leen", () => {
    expect(acentoSirveComoTexto("#FF4E1F", fondo)).toBe(true);
    expect(acentoSirveComoTexto("#38BDF8", fondo)).toBe(true);
  });

  it("rechaza un acento oscuro sobre un fondo oscuro", () => {
    // Sirve para rellenar un botón, pero un precio escrito así desaparece.
    expect(acentoSirveComoTexto("#1D2A4A", fondo)).toBe(false);
  });
});

describe("mezclarHacia", () => {
  it("no se mueve con proporción 0 y llega al destino con 1", () => {
    expect(mezclarHacia("#FF4E1F", "papel", 0)).toBe("#ff4e1f");
    expect(mezclarHacia("#FF4E1F", "papel", 1)).toBe("#ede7da");
    expect(mezclarHacia("#FF4E1F", "tinta", 1)).toBe("#171512");
  });

  it("aclarar sube el contraste contra un fondo oscuro", () => {
    const oscuro = "#1D2A4A";
    const claro = mezclarHacia(oscuro, "papel", 0.6);
    expect(acentoSirveComoTexto(claro, "#171512")).toBe(true);
  });
});
