/**
 * Las guías, y por qué existen.
 *
 * El producto llegó a Google con cinco URLs, una sola comercial. No se puede
 * competir por "software para restaurantes" con una portada: los resultados de
 * ese término son, en su mayoría, contenido editorial —listas y comparativas—,
 * no portadas de productos. Estas páginas son la parte de eso que sí depende de
 * nosotros.
 *
 * **La regla de qué se publica:** cada guía trata algo que Platlia sabe por
 * haberlo construido y verificado contra la realidad —la API de la DIAN, el
 * texto de la ley, la aritmética del costeo—, no por resumir lo que ya escribió
 * otro. Una guía que repite lo que hay en diez blogs no va a rankear y, peor, no
 * le sirve a quien la lee.
 *
 * **La regla de exactitud:** toda afirmación legal o tributaria va con su fuente
 * enlazada y su fecha. El lector de esto es alguien que va a tomar una decisión
 * de plata con lo que diga acá; equivocarse no es un problema de posicionamiento,
 * es un problema para él.
 *
 * El metadato vive acá y separado del contenido porque lo consumen tres lugares
 * que no deben poder divergir: el índice, `generateStaticParams` y el sitemap.
 */
export type Guia = {
  slug: string;
  /** El `<h1>` y el `<title>`. Lleva el término por el que se quiere aparecer. */
  titulo: string;
  /** La `meta description`. Es lo que se lee en el resultado de búsqueda. */
  descripcion: string;
  /** La bajada en pantalla. Distinta de la descripción: acá ya entró a leer. */
  bajada: string;
  publicado: string;
  actualizado: string;
  /** Minutos de lectura, para el índice. */
  lectura: number;
  /** La página comercial con la que se enlaza en los dos sentidos. */
  relacionada:
    "/software-para-restaurantes" | "/software-para-bares" | "/precios";
};

export const GUIAS: readonly Guia[] = [
  {
    slug: "impuesto-al-consumo-o-iva-en-restaurantes",
    titulo: "Impuesto al consumo o IVA en restaurantes: cuál cobrás y por qué",
    descripcion:
      "El 8% de impuesto al consumo frente al 19% de IVA en un restaurante colombiano: quién cobra cuál, quién no es responsable y la excepción de las franquicias.",
    bajada:
      "Es la confusión más cara de la categoría, porque se paga con una factura rechazada o con un impuesto cobrado de más durante meses.",
    publicado: "2026-08-29",
    actualizado: "2026-08-29",
    lectura: 7,
    relacionada: "/software-para-restaurantes",
  },
  {
    slug: "factura-electronica-dian-para-restaurantes",
    titulo:
      "Factura electrónica DIAN para restaurantes: lo que nadie te cuenta antes de emitir",
    descripcion:
      "Rangos de numeración, notas crédito, CUFE y CUDE, y por qué el precio de tu carta no es la base gravable. Lo aprendido emitiendo de verdad.",
    bajada:
      "Casi todo lo que sale mal al emitir sale mal por cuatro cosas concretas. Las cuatro se ven recién con alguien esperando en la caja.",
    publicado: "2026-08-29",
    actualizado: "2026-08-29",
    lectura: 9,
    relacionada: "/software-para-restaurantes",
  },
  {
    slug: "propina-en-colombia",
    titulo: "La propina en Colombia: qué exige la Ley 1935 de 2018",
    descripcion:
      "Voluntaria, tope del 10%, hay que preguntarla antes de facturar y el dueño no puede tocarla. Qué exige la ley y qué significa en la operación.",
    bajada:
      "Hay un artículo que casi ningún sistema cumple, y no es el del 10%: es el que obliga a preguntar antes de imprimir la cuenta.",
    publicado: "2026-08-29",
    actualizado: "2026-08-29",
    lectura: 6,
    relacionada: "/software-para-restaurantes",
  },
  {
    slug: "cierre-de-caja-en-un-bar",
    titulo:
      "Cierre de caja en un bar: por qué la jornada no termina a medianoche",
    descripcion:
      "Cómo cuadrar el arqueo en un negocio que cierra de madrugada y qué se rompe en los informes cuando la noche se parte en dos a medianoche.",
    bajada:
      "Si tu sistema corta a las 00:00, la noche del viernes se te reparte entre dos días y ningún informe vuelve a coincidir con la caja.",
    publicado: "2026-08-29",
    actualizado: "2026-08-29",
    lectura: 6,
    relacionada: "/software-para-bares",
  },
  {
    slug: "costo-por-plato",
    titulo:
      "Costo por plato: cómo saber cuánto te cuesta de verdad lo que vendés",
    descripcion:
      "Costeo por receta, promedio ponderado y margen real: por qué la última compra no puede pisar el costo de lo que ya estaba en la nevera.",
    bajada:
      "Dos errores de aritmética hacen que un plato que pierde plata parezca rentable durante toda una temporada.",
    publicado: "2026-08-29",
    actualizado: "2026-08-29",
    lectura: 8,
    relacionada: "/software-para-restaurantes",
  },
];

export function guiaPorSlug(slug: string): Guia | undefined {
  return GUIAS.find((g) => g.slug === slug);
}
