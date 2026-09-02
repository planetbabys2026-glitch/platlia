/**
 * ESC/POS: el idioma que hablan las impresoras térmicas.
 *
 * `ticket.ts` decide QUÉ dice cada línea; esto decide cómo se le manda a la
 * máquina. Van separados porque son dos problemas distintos y los dos se
 * equivocan en silencio: una columna descuadrada no se ve hasta que sale el
 * papel, y un byte de control mal puesto imprime jeroglíficos.
 *
 * Módulo puro y sin imports: toda la decisión de formato se toma en el servidor,
 * donde se puede probar, y el agente que corre en el bar solo escribe estos bytes
 * en un socket. Un agente tonto es un agente que no hay que actualizar.
 *
 * ## Por qué no UTF-8
 *
 * Una térmica no entiende UTF-8. Trabaja con páginas de códigos de un byte, y la
 * que trae casi toda impresora de la región es CP850 / CP858 (latín 1). Mandarle
 * los bytes de UTF-8 imprime "MenÃº" en vez de "Menú", que es exactamente el bug
 * que se descubre con el cliente esperando el recibo.
 */

/** Comandos ESC/POS que se usan acá. Los nombres son los del manual. */
const ESC = 0x1b;
const GS = 0x1d;

/** Página de códigos 19 = CP858 (latín 1 con el símbolo del euro). */
const PAGINA_CP858 = 19;

/**
 * Los caracteres que el español necesita y dónde viven en CP850/CP858.
 *
 * No es la tabla completa a propósito: es lo que aparece en la carta de un bar
 * colombiano. Todo lo que no esté acá cae en el reemplazo, que es preferible a
 * un byte al azar.
 */
const CP858: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5,
  ü: 0x81, Ü: 0x9a,
  "¿": 0xa8, "¡": 0xad,
  "°": 0xf8, "ª": 0xa6, "º": 0xa7,
  "«": 0xae, "»": 0xaf,
  "€": 0xd5,
};

/** Lo que se imprime cuando un carácter no existe en la página de códigos. */
const REEMPLAZO = 0x3f; // '?'

/**
 * Texto a bytes de la impresora.
 *
 * Las comillas tipográficas y los guiones largos se normalizan a su versión ASCII
 * en vez de caer en '?': un tiquete lleno de interrogantes se lee peor que uno
 * con comillas rectas.
 */
export function codificarTexto(texto: string): number[] {
  const normalizado = texto
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[·•]/g, "-")
    .replace(/ /g, " ");

  const bytes: number[] = [];
  for (const caracter of normalizado) {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (codigo === 0x0a) {
      bytes.push(0x0a);
    } else if (codigo >= 0x20 && codigo <= 0x7e) {
      bytes.push(codigo);
    } else if (CP858[caracter] !== undefined) {
      bytes.push(CP858[caracter]);
    } else {
      bytes.push(REEMPLAZO);
    }
  }
  return bytes;
}

/**
 * Cuántos puntos de ancho tiene el cabezal.
 *
 * No es el ancho del papel ni el de caracteres: es la resolución real. A 203 dpi
 * —lo normal en estas máquinas— un rollo de 80 mm da 576 puntos y uno de 58 da
 * 384. Pasarse de ese número no agranda el logo: la impresora descarta lo que
 * sobra a la derecha, así que un logo centrado saldría cortado de un lado.
 */
export function puntosDelCabezal(receiptWidth: string): number {
  return receiptWidth === "MM55" ? 384 : 576;
}

/** Los anchos de cabezal que existen, en puntos. */
export const ANCHOS_DE_CABEZAL = [384, 576] as const;

/** Un mapa de bits listo para `GS v 0`. */
export type RasterDeLogo = {
  /** En puntos, siempre múltiplo de 8: el comando cuenta el ancho en BYTES. */
  ancho: number;
  alto: number;
  /** Fila por fila, `ancho / 8` bytes cada una. Bit en 1 = punto quemado. */
  datos: Uint8Array;
};

/**
 * `GS v 0` — el comando que manda un mapa de bits.
 *
 * El ancho viaja en BYTES y el alto en PUNTOS, cada uno en dos bytes little
 * endian. Confundir las unidades no da error: la impresora lee el chorro de
 * bytes con el largo equivocado y escupe ruido durante varios centímetros.
 *
 * Puro, para poder afirmar los bytes en un test en vez de mirando el papel.
 */
export function comandoRaster(raster: RasterDeLogo): number[] {
  const porFila = raster.ancho / 8;
  return [
    0x1d, 0x76, 0x30, 0x00,
    porFila & 0xff, (porFila >> 8) & 0xff,
    raster.alto & 0xff, (raster.alto >> 8) & 0xff,
    ...raster.datos,
  ];
}

export type OpcionesDeImpresion = {
  /** Las líneas ya compuestas por `ticket.ts`, en su ancho de caracteres. */
  lineas: readonly string[];
  /**
   * Cuántas líneas del principio van en letra grande.
   *
   * Es el nombre del negocio en un recibo, o el número de turno en una comanda:
   * lo único que alguien busca de lejos, con el papel en la mano y el local
   * lleno.
   */
  lineasDestacadas?: number;
  /**
   * Imprime TODO el trabajo a doble alto.
   *
   * Es para la comanda: se lee de pie, a un metro, con las manos ocupadas y a
   * veces con vapor de por medio. Doble **alto** y no doble ancho a propósito —el
   * ancho manda el presupuesto de columnas, y duplicarlo partiría "Bandeja paisa"
   * en dos renglones—: así la letra crece al doble y las líneas siguen cabiendo
   * donde `envolver` calculó que caben.
   */
  dobleAlto?: boolean;
  /** Corta el papel al terminar. Se apaga en impresoras sin guillotina. */
  cortar?: boolean;
  /** Manda el pulso que abre el cajón de dinero. Solo tiene sentido en la caja. */
  abrirCajon?: boolean;
  /**
   * El logo del negocio, arriba de todo y centrado.
   *
   * Va antes del encabezado y no en lugar de él: el nombre, el NIT y la dirección
   * siguen imprimiéndose en texto. Un logo es una marca, no un dato fiscal, y
   * quien reclame una garantía necesita el NIT legible aunque el dibujo salga
   * flojo.
   */
  logo?: RasterDeLogo | null;
};

/**
 * El trabajo completo, listo para escribir en el socket de la impresora.
 *
 * Arranca inicializando: una térmica conserva el estado del trabajo anterior
 * —negrita, doble alto, alineación—, así que si el trabajo previo se cortó a la
 * mitad el siguiente sale en negrita sin que nadie entienda por qué.
 */
export function componerEscPos(opciones: OpcionesDeImpresion): Uint8Array {
  const {
    lineas,
    lineasDestacadas = 0,
    dobleAlto = false,
    cortar = true,
    abrirCajon = false,
  } = opciones;

  const bytes: number[] = [];

  // ESC @ — inicializa y limpia todo el estado anterior.
  bytes.push(ESC, 0x40);
  // ESC t n — página de códigos.
  bytes.push(ESC, 0x74, PAGINA_CP858);

  if (opciones.logo) {
    // ESC a 1 — centrado. Se apaga enseguida: la alineación es estado de la
    // impresora y dejarla puesta correría el texto entero del tiquete, que está
    // compuesto a la izquierda con relleno de espacios.
    bytes.push(ESC, 0x61, 0x01);
    bytes.push(...comandoRaster(opciones.logo));
    bytes.push(ESC, 0x61, 0x00);
    bytes.push(0x0a);
  }

  lineas.forEach((linea, i) => {
    const destacada = i < lineasDestacadas;

    if (destacada) {
      // ESC E 1 (negrita) + GS ! 0x11 (doble ancho y doble alto).
      bytes.push(ESC, 0x45, 1);
      bytes.push(GS, 0x21, 0x11);
    } else if (dobleAlto) {
      // GS ! 0x01 — doble alto, ancho normal.
      bytes.push(GS, 0x21, 0x01);
    }

    bytes.push(...codificarTexto(linea), 0x0a);

    if (destacada) {
      bytes.push(GS, 0x21, 0x00);
      bytes.push(ESC, 0x45, 0);
    } else if (dobleAlto) {
      bytes.push(GS, 0x21, 0x00);
    }
  });

  // El papel avanza para que el corte no parta la última línea y para que quede
  // algo para agarrar.
  bytes.push(0x0a, 0x0a, 0x0a);

  if (abrirCajon) {
    // ESC p 0 25 250 — pulso en el conector del cajón.
    bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  if (cortar) {
    // GS V 1 — corte parcial: deja un puente de papel para que la tira no se
    // caiga al piso antes de que alguien la tome.
    bytes.push(GS, 0x56, 0x01);
  }

  return Uint8Array.from(bytes);
}

/** Los bytes en base64, que es como viajan hasta el agente. */
export function aBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
