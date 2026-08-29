import { CORREO_SOPORTE, WHATSAPP_SOPORTE_VISIBLE } from "@/lib/soporte";
import { preguntasFrecuentes } from "../preguntas";

/**
 * Lo que Google y los asistentes leen para saber QUÉ es esto.
 *
 * Una página sin datos estructurados obliga a la máquina a adivinar a partir del
 * texto. Con ellos, el precio, el país, la moneda y la prueba gratis son campos
 * y no una frase que hay que interpretar: es la diferencia entre aparecer en una
 * respuesta de "¿qué software uso para mi bar en Colombia?" y no aparecer.
 *
 * **El precio viene de la lista**, como en todas las pantallas: si el archivo
 * dijera 50.000 y el checkout cobrara 69.900, el buscador mostraría el número
 * viejo durante semanas —y ese número es el que la persona recuerda—.
 *
 * Las preguntas son las que de verdad frenan una venta —cuánto cuesta, si la
 * factura va aparte, si hay permanencia, qué equipo hace falta—, no las que uno
 * quisiera que preguntaran. Un asistente cita la respuesta tal cual, así que
 * cada una tiene que ser cierta y estar completa por sí sola.
 */
export function DatosEstructurados({
  url,
  mensualCop,
}: {
  url: string;
  /** El precio de una sede, tomado de la lista vigente. */
  mensualCop: number | null;
}) {
  const producto = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Platlia",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Punto de venta para restaurantes",
    operatingSystem: "Web, Android, iOS",
    url,
    inLanguage: "es-CO",
    description:
      "Software de gestión para bares y restaurantes: toma de pedidos en mesa, pantalla de cocina, caja, menú QR con autopedido, domicilios, inventario por receta, informes, facturación electrónica DIAN y conexión con asistentes de IA por MCP.",
    featureList: [
      "Toma de pedidos en mesa y en mostrador",
      "Pantalla de cocina con tiempos por plato",
      "Menú QR personalizable con autopedido",
      "Domicilios con seguimiento para el cliente",
      "Caja con arqueo y cierre de turno",
      "Inventario con receta y costo por plato",
      "Informes por día, semana, mes y año",
      "Facturación electrónica DIAN",
      "Impresión térmica de comandas y recibos",
      "Conexión con asistentes de IA (MCP) para consultar el negocio en lenguaje natural",
    ],
    ...(mensualCop === null
      ? {}
      : {
          offers: {
            "@type": "Offer",
            price: mensualCop,
            priceCurrency: "COP",
            url: `${url}#precios`,
            availability: "https://schema.org/InStock",
            description: "Licencia mensual por local. 7 días de prueba gratis, sin tarjeta.",
          },
        }),
    provider: {
      "@type": "Organization",
      name: "Platlia",
      url,
      email: CORREO_SOPORTE,
      telephone: WHATSAPP_SOPORTE_VISIBLE,
      areaServed: { "@type": "Country", name: "Colombia" },
    },
  };

  const preguntas = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: preguntasFrecuentes(mensualCop).map(({ pregunta, respuesta }) => ({
      "@type": "Question",
      name: pregunta,
      acceptedAnswer: { "@type": "Answer", text: respuesta },
    })),
  };

  return (
    <>
      {/* `JSON.stringify` y no una plantilla: cualquier comilla en un texto
          rompería el bloque y el buscador descartaría TODO el marcado en
          silencio, que es la peor forma de perderlo. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(producto) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(preguntas) }}
      />
    </>
  );
}

/**
 * El marcado de una guía.
 *
 * `Article` es lo que le permite a Google mostrar la fecha junto al resultado, y
 * a un asistente saber que esto es contenido editorial fechado y no la página de
 * un producto. `dateModified` importa más que `datePublished`: es el campo con el
 * que se decide si vale la pena volver a rastrear.
 *
 * Va junto con `BreadcrumbList` porque las migas son lo que convierte la línea de
 * `platlia.com › guias › propina-en-colombia` en algo legible, y eso sube el
 * porcentaje de clics sin mover la posición.
 *
 * Mismo `JSON.stringify` que arriba, y por la misma razón: una comilla en un
 * título rompería el bloque entero y el buscador lo descartaría en silencio.
 */
export function ArticuloEstructurado({
  url,
  titulo,
  descripcion,
  publicado,
  actualizado,
  seccion,
}: {
  /** La URL absoluta y canónica de la guía. */
  url: string;
  titulo: string;
  descripcion: string;
  publicado: string;
  actualizado: string;
  /** El nombre visible de la sección, para las migas. */
  seccion: { nombre: string; url: string };
}) {
  const origen = new URL(url).origin;

  const articulo = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: titulo,
    description: descripcion,
    inLanguage: "es-CO",
    datePublished: publicado,
    dateModified: actualizado,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Platlia", url: origen },
    publisher: { "@type": "Organization", name: "Platlia", url: origen },
  };

  const migas = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: origen },
      { "@type": "ListItem", position: 2, name: seccion.nombre, item: seccion.url },
      { "@type": "ListItem", position: 3, name: titulo, item: url },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articulo) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(migas) }}
      />
    </>
  );
}
