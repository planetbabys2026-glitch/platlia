import sharp from "sharp";
import { ANCHOS_DE_CABEZAL, type RasterDeLogo } from "@/lib/printing/escpos";

/**
 * El logo del negocio, convertido a lo único que una térmica sabe imprimir.
 *
 * Una impresora de tickets no recibe un PNG: recibe un mapa de bits de UN bit por
 * punto y lo quema punto por punto. No hay grises, no hay color y no hay
 * escalado. Todo eso hay que hacerlo de este lado.
 *
 * **No importa `server-only`**, por la misma razón que `lib/email/enviar.ts`: los
 * tests corren en jsdom y ese módulo lanza a propósito fuera de la condición
 * `react-server`, así que con él la conversión no se podría probar —y es
 * justamente la parte que no se puede verificar mirando la pantalla, sino en el
 * papel—. La guarda real es `sharp`: es un binario nativo y no sobrevive a un
 * bundle de navegador, así que un import desde un componente cliente revienta en
 * el build y no en producción.
 *
 * **Esto corre al SUBIR el logo, no al imprimir.** El recibo se encola dentro de
 * la transacción que cierra la venta, y bajar y convertir una imagen ahí sería un
 * lock de base esperando a Cloudinary. El mapa de bits terminado queda en
 * `LogoDeTirilla` y el momento de imprimir solo lo lee.
 */

/**
 * Lo más alto que se le permite a un logo, en puntos.
 *
 * A 203 dpi son unos 22 mm de papel. No es una restricción estética: cada
 * milímetro de logo es papel que se gasta en cada venta de cada noche, y un logo
 * cuadrado sin tope se comería 7 cm de rollo por tiquete.
 */
const ALTO_MAXIMO = 180;

/**
 * Umbral ordenado de Bayer 4×4.
 *
 * Un umbral fijo convierte cualquier foto en una mancha, y difuminar siempre
 * ensucia el arte plano que es la mayoría de los logos. Bayer resuelve las dos:
 * el negro puro y el blanco puro caen del mismo lado con cualquier umbral, así
 * que un logo de dos tintas sale idéntico, y solo los medios tonos se reparten.
 */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * De un archivo de imagen cualquiera al mapa de bits de la impresora.
 *
 * `flatten` sobre blanco va primero y no es un detalle: un PNG con fondo
 * transparente —que es como viene casi todo logo— tiene los píxeles de fondo en
 * negro con alfa 0, y sin aplanarlos el logo sale como un rectángulo negro
 * sólido con la marca en blanco adentro.
 */
export async function rasterizarLogo(
  archivo: Buffer,
  anchoMaximo: number,
): Promise<RasterDeLogo> {
  // El ancho se recorta a un múltiplo de 8 porque cada byte del comando lleva
  // ocho puntos: un ancho de 100 obligaría a rellenar media columna de bits.
  const anchoTope = Math.floor(anchoMaximo / 8) * 8;

  const { data, info } = await sharp(archivo)
    .flatten({ background: "#ffffff" })
    .resize({ width: anchoTope, height: ALTO_MAXIMO, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // El redimensionado conserva la proporción, así que el ancho real puede ser
  // menor al tope: se vuelve a subir al múltiplo de 8 rellenando con blanco.
  const anchoReal = info.width;
  const ancho = Math.ceil(anchoReal / 8) * 8;
  const alto = info.height;
  const porFila = ancho / 8;
  const datos = new Uint8Array(porFila * alto);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < anchoReal; x++) {
      const gris = data[y * anchoReal + x]!;
      // El umbral se corre según la posición: los extremos no se mueven.
      const umbral = (BAYER[y % 4]![x % 4]! + 0.5) * 16;
      if (gris >= umbral) continue; // claro: no se quema

      datos[y * porFila + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }

  return { ancho, alto, datos };
}


/**
 * Los dos mapas de bits que hacen falta, uno por ancho de cabezal.
 *
 * Se calculan los dos al subir aunque el negocio use un solo rollo: rasterizar
 * es la parte cara y cambiar de impresora no puede exigir volver a cargar el
 * logo, sobre todo porque nadie relacionaría una cosa con la otra —el síntoma
 * sería "desde que cambiamos la impresora no sale el logo"—.
 */
export async function rasterizarParaTodosLosRollos(
  archivo: Buffer,
): Promise<RasterDeLogo[]> {
  return Promise.all(ANCHOS_DE_CABEZAL.map((ancho) => rasterizarLogo(archivo, ancho)));
}
