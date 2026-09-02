import { describe, expect, it } from "vitest";
import { aBase64, codificarTexto, componerEscPos } from "@/lib/printing/escpos";

/**
 * Los bytes que salen para la impresora.
 *
 * Un error acá no rompe ninguna pantalla: sale un papel con jeroglíficos, o no
 * sale nada, y eso se descubre con el cliente esperando el recibo.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Busca una secuencia de bytes dentro de otra. */
function contiene(donde: Uint8Array, que: number[]): boolean {
  outer: for (let i = 0; i + que.length <= donde.length; i++) {
    for (let j = 0; j < que.length; j++) {
      if (donde[i + j] !== que[j]) continue outer;
    }
    return true;
  }
  return false;
}

describe("codificarTexto", () => {
  it("el ASCII imprimible pasa tal cual", () => {
    expect(codificarTexto("Total: $12.000")).toEqual(
      [..."Total: $12.000"].map((c) => c.charCodeAt(0)),
    );
  });

  it("los acentos van en CP858, no en UTF-8", () => {
    // El bug clásico: mandar UTF-8 imprime "MenÃº". En CP858 la ú es 0xA3 y
    // ocupa UN byte.
    expect(codificarTexto("ú")).toEqual([0xa3]);
    expect(codificarTexto("ñ")).toEqual([0xa4]);
    expect(codificarTexto("Ñ")).toEqual([0xa5]);
    expect(codificarTexto("á")).toHaveLength(1);
  });

  it("una palabra con acento no cambia de largo", () => {
    // Si un acento ocupara dos bytes, las columnas del tiquete se correrían.
    expect(codificarTexto("Limonada")).toHaveLength(8);
    expect(codificarTexto("Limónada")).toHaveLength(8);
  });

  it("normaliza lo tipográfico en vez de tirarlo a interrogantes", () => {
    // Un tiquete lleno de "?" se lee peor que uno con comillas rectas.
    expect(codificarTexto("“hola”")).toEqual(codificarTexto('"hola"'));
    expect(codificarTexto("a—b")).toEqual(codificarTexto("a-b"));
    expect(codificarTexto("…")).toEqual(codificarTexto("..."));
    expect(codificarTexto("Café · Especial")).toEqual(codificarTexto("Café - Especial"));
  });

  it("lo que no existe en la página de códigos sale como interrogante", () => {
    expect(codificarTexto("🍺")).toEqual([0x3f]);
  });

  it("conserva el salto de línea", () => {
    expect(codificarTexto("a\nb")).toEqual([0x61, 0x0a, 0x62]);
  });
});

describe("componerEscPos", () => {
  const lineas = ["BAR DEMO", "Cerveza      $12.000", "TOTAL        $12.000"];

  it("arranca inicializando la impresora", () => {
    // Una térmica conserva el estado del trabajo anterior: si el previo se cortó
    // en negrita, este saldría en negrita sin que nadie entienda por qué.
    const bytes = componerEscPos({ lineas });
    expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40]);
  });

  it("fija la página de códigos antes de escribir", () => {
    const bytes = componerEscPos({ lineas });
    expect(contiene(bytes, [ESC, 0x74, 19])).toBe(true);
  });

  it("corta el papel al final", () => {
    expect(contiene(componerEscPos({ lineas }), [GS, 0x56, 0x01])).toBe(true);
  });

  it("se puede no cortar, para impresoras sin guillotina", () => {
    expect(contiene(componerEscPos({ lineas, cortar: false }), [GS, 0x56, 0x01])).toBe(false);
  });

  it("el cajón solo se abre si se pide", () => {
    const pulso = [ESC, 0x70, 0x00, 0x19, 0xfa];
    expect(contiene(componerEscPos({ lineas }), pulso)).toBe(false);
    expect(contiene(componerEscPos({ lineas, abrirCajon: true }), pulso)).toBe(true);
  });

  it("las líneas destacadas van en grande y las demás no", () => {
    const grande = [GS, 0x21, 0x11];
    expect(contiene(componerEscPos({ lineas }), grande)).toBe(false);

    const conTitulo = componerEscPos({ lineas, lineasDestacadas: 1 });
    expect(contiene(conTitulo, grande)).toBe(true);
    // Y vuelve al tamaño normal: si no, el tiquete entero sale gigante.
    expect(contiene(conTitulo, [GS, 0x21, 0x00])).toBe(true);
  });

  it("cada línea termina con un salto", () => {
    const bytes = componerEscPos({ lineas: ["ab"], cortar: false });
    expect(contiene(bytes, [0x61, 0x62, 0x0a])).toBe(true);
  });

  it("avanza el papel antes del corte", () => {
    // Sin esto la guillotina parte la última línea, o el tiquete queda sin
    // margen para agarrarlo.
    const bytes = componerEscPos({ lineas: ["x"] });
    expect(contiene(bytes, [0x0a, 0x0a, 0x0a, GS, 0x56, 0x01])).toBe(true);
  });

  it("un trabajo vacío igual sale válido", () => {
    const bytes = componerEscPos({ lineas: [] });
    expect(bytes.length).toBeGreaterThan(0);
    expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40]);
  });
});

describe("aBase64", () => {
  it("es reversible", () => {
    const bytes = componerEscPos({ lineas: ["Café ñandú"] });
    expect(Uint8Array.from(Buffer.from(aBase64(bytes), "base64"))).toEqual(bytes);
  });
});

/**
 * El tamaño de la comanda, en bytes.
 *
 * Esto no se ve leyendo el código ni mirando la pantalla: se ve en el papel, y si
 * está mal nadie se entera hasta que un cocinero no puede leer un pedido.
 */
describe("doble alto para la comanda", () => {
  const GS = 0x1d;

  it("cada línea normal se abre en doble alto y se cierra", () => {
    const bytes = componerEscPos({ lineas: ["ARROZ"], dobleAlto: true, cortar: false });
    // GS ! 0x01 = doble alto con ancho normal.
    expect(contiene(bytes, [GS, 0x21, 0x01])).toBe(true);
    // Y vuelve a tamaño normal: una térmica conserva el estado, así que sin el
    // reset el trabajo siguiente saldría gigante sin que nadie entienda por qué.
    expect(contiene(bytes, [GS, 0x21, 0x00])).toBe(true);
  });

  /**
   * Doble ALTO y no doble ancho: el ancho manda el presupuesto de columnas que
   * `envolver` ya usó para partir las líneas, y duplicarlo cortaría los nombres
   * de plato por la mitad.
   */
  it("no toca el ancho", () => {
    const bytes = componerEscPos({ lineas: ["ARROZ"], dobleAlto: true, cortar: false });
    expect(contiene(bytes, [GS, 0x21, 0x10])).toBe(false);
    expect(contiene(bytes, [GS, 0x21, 0x11])).toBe(false);
  });

  it("sin la opción, nada cambia respecto de lo que se imprimía antes", () => {
    const bytes = componerEscPos({ lineas: ["ARROZ"], cortar: false });
    expect(contiene(bytes, [GS, 0x21, 0x01])).toBe(false);
  });

  it("la línea destacada sigue saliendo a doble ancho y alto", () => {
    const bytes = componerEscPos({
      lineas: ["MESA 12", "ARROZ"],
      lineasDestacadas: 1,
      dobleAlto: true,
      cortar: false,
    });
    expect(contiene(bytes, [GS, 0x21, 0x11])).toBe(true);
  });
});

/**
 * Desde que el recibo y la comanda se componen en mayúsculas, todo acento que
 * llegue a la impresora llega en caja alta. Si la tabla tuviera la minúscula y
 * no su mayúscula, un nombre con tilde saldría con un "?" en el papel y en
 * ningún otro lado: no falla nada, solo sale mal impreso.
 */
describe("CP858 cubre la caja alta de todo lo que cubre en minúscula", () => {
  it("ningún acento se convierte en el reemplazo al pasar a mayúsculas", () => {
    const acentos = "áéíóúñü";
    const bytes = Array.from(codificarTexto(acentos.toUpperCase()));
    expect(bytes).not.toContain(0x3f);
    expect(bytes).toHaveLength(acentos.length);
  });
});
