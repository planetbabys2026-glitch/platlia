import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { comandoRaster, componerEscPos, puntosDelCabezal } from "@/lib/printing/escpos";
import { rasterizarLogo } from "@/lib/printing/logo";

/**
 * El logo en la térmica es el único lugar del producto donde se manda un mapa de
 * bits, y es lo que más fácil sale mal sin fallar: si el ancho o el alto viajan
 * en la unidad equivocada, la impresora lee el chorro de bytes con el largo que
 * le dijimos y escupe ruido durante varios centímetros. No hay excepción, no hay
 * log: hay papel arruinado.
 */

describe("comandoRaster", () => {
  it("manda el ancho en BYTES y el alto en PUNTOS", () => {
    const bytes = comandoRaster({ ancho: 16, alto: 300, datos: new Uint8Array(2 * 300) });

    expect(bytes.slice(0, 4)).toEqual([0x1d, 0x76, 0x30, 0x00]);
    // 16 puntos de ancho son 2 bytes por fila, en little endian.
    expect(bytes.slice(4, 6)).toEqual([2, 0]);
    // 300 puntos de alto NO entran en un byte: 300 = 0x012C.
    expect(bytes.slice(6, 8)).toEqual([0x2c, 0x01]);
  });

  it("el cuerpo son exactamente ancho/8 × alto bytes", () => {
    const datos = new Uint8Array((48 / 8) * 20);
    const bytes = comandoRaster({ ancho: 48, alto: 20, datos });
    expect(bytes).toHaveLength(8 + datos.length);
  });
});

describe("puntosDelCabezal", () => {
  it("58 mm son 384 puntos y 80 mm son 576", () => {
    expect(puntosDelCabezal("MM55")).toBe(384);
    expect(puntosDelCabezal("MM80")).toBe(576);
  });
});

describe("componerEscPos con logo", () => {
  const raster = { ancho: 8, alto: 2, datos: Uint8Array.from([0xff, 0x00]) };

  it("lo centra y vuelve a alinear a la izquierda", () => {
    const bytes = [...componerEscPos({ lineas: ["HOLA"], logo: raster })];
    const centrar = bytes.findIndex((b, i) => b === 0x1b && bytes[i + 1] === 0x61);

    expect(centrar).toBeGreaterThan(-1);
    expect(bytes[centrar + 2]).toBe(0x01);
    // Y se apaga: la alineación es estado de la impresora, y dejarla puesta
    // correría el texto entero, que está compuesto con relleno de espacios.
    const restaurar = bytes.findIndex(
      (b, i) => i > centrar && b === 0x1b && bytes[i + 1] === 0x61 && bytes[i + 2] === 0x00,
    );
    expect(restaurar).toBeGreaterThan(centrar);
  });

  it("sin logo no aparece ningún comando de mapa de bits", () => {
    const bytes = [...componerEscPos({ lineas: ["HOLA"] })];
    const hayRaster = bytes.some(
      (b, i) => b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30,
    );
    expect(hayRaster).toBe(false);
  });
});

describe("rasterizarLogo", () => {
  /** Un cuadrado negro sobre fondo blanco: se sabe exactamente qué tiene que salir. */
  async function cuadrado(lado: number, canal: number) {
    return sharp({
      create: { width: lado, height: lado, channels: 3, background: { r: canal, g: canal, b: canal } },
    })
      .png()
      .toBuffer();
  }

  it("el ancho sale múltiplo de 8: cada byte del comando lleva ocho puntos", async () => {
    const r = await rasterizarLogo(await cuadrado(100, 0), 300);
    expect(r.ancho % 8).toBe(0);
    expect(r.datos).toHaveLength((r.ancho / 8) * r.alto);
  });

  it("no se pasa del cabezal ni del tope de alto", async () => {
    const r = await rasterizarLogo(await cuadrado(2000, 0), 384);
    expect(r.ancho).toBeLessThanOrEqual(384);
    // 22 mm a 203 dpi. Cada milímetro es papel que se gasta en CADA venta.
    expect(r.alto).toBeLessThanOrEqual(180);
  });

  it("el negro se quema entero y el blanco no se quema nada", async () => {
    const negro = await rasterizarLogo(await cuadrado(64, 0), 64);
    expect([...negro.datos].every((b) => b === 0xff)).toBe(true);

    const blanco = await rasterizarLogo(await cuadrado(64, 255), 64);
    expect([...blanco.datos].every((b) => b === 0x00)).toBe(true);
  });

  it("un PNG transparente no sale como un rectángulo negro", async () => {
    // Sin `flatten` sobre blanco, el fondo transparente —que es como viene casi
    // todo logo— tiene sus píxeles en negro con alfa 0 y se quema entero.
    const transparente = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const r = await rasterizarLogo(transparente, 64);
    expect([...r.datos].every((b) => b === 0x00)).toBe(true);
  });
});
