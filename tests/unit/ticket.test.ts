import { describe, expect, it } from "vitest";
import {
  anchoEnCaracteres,
  centrar,
  envolver,
  lineaDeProducto,
  lineaDoble,
  separador,
} from "@/lib/printing/ticket";

describe("anchoEnCaracteres", () => {
  it("traduce el papel a caracteres", () => {
    expect(anchoEnCaracteres("MM55")).toBe(32);
    expect(anchoEnCaracteres("MM80")).toBe(48);
  });

  it("ante un papel desconocido asume el ancho grande", () => {
    // Mejor un tiquete con espacio de sobra que uno cortado.
    expect(anchoEnCaracteres("MM99")).toBe(48);
  });
});

describe("lineaDoble", () => {
  it("pega la cifra al borde derecho", () => {
    const linea = lineaDoble("Cerveza", "$5.000", 32);
    expect(linea).toHaveLength(32);
    expect(linea.endsWith("$5.000")).toBe(true);
    expect(linea.startsWith("Cerveza")).toBe(true);
  });

  it("recorta el texto, nunca la cifra", () => {
    // Un nombre cortado se entiende; un precio cortado es un reclamo.
    const linea = lineaDoble("Picada para compartir bien grande", "$65.000", 24);
    expect(linea).toHaveLength(24);
    expect(linea.endsWith("$65.000")).toBe(true);
  });

  it("deja al menos un espacio entre las dos columnas", () => {
    const linea = lineaDoble("Bandeja paisa completa", "$32.000", 30);
    expect(linea).toMatch(/ \$32\.000$/);
  });

  it("si la cifra sola no entra, muestra su parte final", () => {
    expect(lineaDoble("x", "$123.456.789", 8)).toHaveLength(8);
  });

  it("conserva la sangría de la izquierda", () => {
    // "  Vuelto" cuelga visualmente del pago que lo generó: si se recortan esos
    // espacios, el subdetalle queda al mismo nivel que el total.
    const linea = lineaDoble("  Vuelto", "$5.000", 32);
    expect(linea.startsWith("  Vuelto")).toBe(true);
    expect(linea).toHaveLength(32);
  });
});

describe("centrar", () => {
  it("centra dejando el sobrante a la derecha", () => {
    expect(centrar("Bar Demo", 12)).toBe("  Bar Demo");
  });

  it("recorta lo que no entra", () => {
    expect(centrar("Bar Demo S.A.S.", 8)).toBe("Bar Demo");
  });
});

describe("envolver", () => {
  it("corta por palabras", () => {
    expect(envolver("Alitas BBQ ocho unidades", 12)).toEqual(["Alitas BBQ", "ocho", "unidades"]);
  });

  it("respeta los saltos de línea del texto", () => {
    expect(envolver("Bar Demo\nNIT 901", 20)).toEqual(["Bar Demo", "NIT 901"]);
  });

  it("parte una palabra que no entra de ninguna forma", () => {
    const lineas = envolver("supercalifragilistico", 8);
    expect(lineas.every((l) => l.length <= 8)).toBe(true);
    expect(lineas.join("")).toBe("supercalifragilistico");
  });

  it("ninguna línea supera el ancho, con cualquier texto", () => {
    const texto =
      "Trucha al ajillo con papas a la francesa y ensalada de la casa sin cebolla";
    for (const ancho of [16, 24, 32, 48]) {
      expect(envolver(texto, ancho).every((l) => l.length <= ancho)).toBe(true);
    }
  });
});

describe("separador", () => {
  it("llena el ancho", () => {
    expect(separador(10)).toBe("----------");
    expect(separador(8, "=")).toBe("========");
  });

  it("rechaza anchos imposibles para un rollo térmico", () => {
    expect(() => separador(4)).toThrow(RangeError);
    expect(() => centrar("x", 2.5)).toThrow(RangeError);
  });
});

describe("lineaDeProducto", () => {
  it("pone cantidad, nombre y total en una línea cuando entra", () => {
    const lineas = lineaDeProducto(2, "Cerveza", "$10.000", 32);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toHaveLength(32);
    expect(lineas[0]).toMatch(/^2 Cerveza/);
    expect(lineas[0].endsWith("$10.000")).toBe(true);
  });

  it("baja el nombre largo a la línea siguiente, con sangría", () => {
    const lineas = lineaDeProducto(1, "Picada para compartir con todo", "$65.000", 32);
    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas[0].endsWith("$65.000")).toBe(true);
    expect(lineas[1].startsWith("  ")).toBe(true);
    expect(lineas.every((l) => l.length <= 32)).toBe(true);
  });

  it("aguanta el papel angosto sin desbordarse", () => {
    const lineas = lineaDeProducto(12, "Alitas BBQ (8 unidades)", "$384.000", 32);
    expect(lineas.every((l) => l.length <= 32)).toBe(true);
  });
});
