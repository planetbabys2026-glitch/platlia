/**
 * Composición de tiquetes térmicos.
 *
 * Una impresora térmica no maquetea: imprime caracteres de ancho fijo en un rollo
 * de papel. Todo el diseño del tiquete se reduce a decidir qué va en cada columna
 * de cada línea, y eso es aritmética de cadenas. Por eso vive acá, en lógica pura
 * con tests, y no mezclado con JSX: un tiquete descuadrado no se ve hasta que sale
 * del rollo, y para entonces el cliente ya lo tiene en la mano.
 *
 * El ancho es en CARACTERES, no en milímetros. Un rollo de 80 mm entra 48
 * caracteres con la fuente por defecto; uno de 55 mm, 32. Si algún día se cambia
 * el tamaño de letra, se cambia acá y en el CSS de @page, juntos.
 *
 * Módulo puro, sin imports.
 */

export const ANCHO_POR_PAPEL = {
  MM55: 32,
  MM80: 48,
} as const;

export type AnchoPapel = keyof typeof ANCHO_POR_PAPEL;

export function anchoEnCaracteres(papel: string): number {
  return ANCHO_POR_PAPEL[papel as AnchoPapel] ?? ANCHO_POR_PAPEL.MM80;
}

function validarAncho(ancho: number): number {
  if (!Number.isInteger(ancho) || ancho < 8) {
    throw new RangeError(`El ancho del tiquete debe ser un entero >= 8, llegó ${ancho}.`);
  }
  return ancho;
}

/**
 * Dos columnas: texto a la izquierda, cifra a la derecha, pegada al borde.
 *
 * Si no entran juntos, se recorta la IZQUIERDA. La cifra nunca se toca: un
 * nombre de producto cortado se entiende; un precio cortado es un reclamo.
 */
export function lineaDoble(izquierda: string, derecha: string, ancho: number): string {
  validarAncho(ancho);

  const der = derecha.trim();
  if (der.length >= ancho) return der.slice(-ancho);

  const disponible = ancho - der.length - 1;
  // Solo se recorta por la derecha: los espacios del principio son sangría a
  // propósito —"  Vuelto" cuelga del pago que lo generó— y perderlos aplana la
  // jerarquía del tiquete.
  const izq = izquierda.trimEnd();
  const recortada = izq.length > disponible ? izq.slice(0, disponible) : izq;

  return recortada + " ".repeat(ancho - recortada.length - der.length) + der;
}

/** Centra un texto; si no entra, lo recorta. */
export function centrar(texto: string, ancho: number): string {
  validarAncho(ancho);
  const limpio = texto.trim();
  if (limpio.length >= ancho) return limpio.slice(0, ancho);
  const izquierda = Math.floor((ancho - limpio.length) / 2);
  return " ".repeat(izquierda) + limpio;
}

/**
 * Corta un texto en líneas sin partir palabras, salvo que una palabra sola no
 * entre —un nombre de producto larguísimo— y ahí sí se parte.
 */
export function envolver(texto: string, ancho: number): string[] {
  validarAncho(ancho);

  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.trim().split(/\s+/).filter(Boolean)) {
      if (palabra.length > ancho) {
        if (actual) {
          lineas.push(actual);
          actual = "";
        }
        for (let i = 0; i < palabra.length; i += ancho) {
          const trozo = palabra.slice(i, i + ancho);
          if (trozo.length === ancho) lineas.push(trozo);
          else actual = trozo;
        }
        continue;
      }

      const candidata = actual ? `${actual} ${palabra}` : palabra;
      if (candidata.length <= ancho) {
        actual = candidata;
      } else {
        lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }

  // Un párrafo vacío es una línea en blanco a propósito; solo se descartan las
  // que quedaron vacías por el recorte.
  return lineas.length === 0 ? [""] : lineas;
}

export function separador(ancho: number, caracter = "-"): string {
  validarAncho(ancho);
  return caracter.repeat(ancho);
}

/**
 * Un renglón del pedido: cantidad y nombre arriba, valor a la derecha; si el
 * nombre no entra, sigue en la línea de abajo con sangría.
 */
export function lineaDeProducto(
  cantidad: number,
  nombre: string,
  totalFormateado: string,
  ancho: number,
): string[] {
  validarAncho(ancho);

  const prefijo = `${cantidad} `;
  const anchoNombre = ancho - totalFormateado.length - 1 - prefijo.length;
  const trozos = envolver(nombre, Math.max(4, anchoNombre));

  const primera = lineaDoble(prefijo + trozos[0], totalFormateado, ancho);
  const resto = trozos.slice(1).map((t) => " ".repeat(prefijo.length) + t);

  return [primera, ...resto];
}
