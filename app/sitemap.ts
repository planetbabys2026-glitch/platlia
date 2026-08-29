import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { RUTAS_PUBLICAS } from "./(marketing)/rutas";
import { GUIAS } from "./(marketing)/guias/guias";

/**
 * Las páginas públicas, para que un buscador sepa que existen.
 *
 * Solo las de la marca. **Las cartas QR de los clientes (`/m/[slug]`) no van
 * acá a propósito**: un negocio activa su menú para que sus comensales lo abran
 * escaneando la mesa, no para aparecer en Google. Publicar su carta y sus
 * precios en un índice sin habérselo preguntado es una decisión que le
 * corresponde a él, no a nosotros. El día que se ofrezca, va con una casilla en
 * Configuración y entra en este listado.
 *
 * **Las guías entran solas desde `GUIAS`**, que es la misma lista con la que se
 * generan las rutas y se pinta el índice. Copiarlas acá a mano garantizaba que
 * tarde o temprano se publicara una guía que el sitemap no nombra, sin que nada
 * fallara.
 *
 * Las fechas salen de `RUTAS_PUBLICAS` y son reales: ver el comentario de ese
 * archivo sobre por qué `new Date()` acá era peor que no poner nada.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paginas = RUTAS_PUBLICAS.map((r) => ({
    url: `${env.APP_URL}${r.ruta === "/" ? "/" : r.ruta}`,
    lastModified: new Date(r.actualizado),
    changeFrequency: r.frecuencia,
    priority: r.prioridad,
  }));

  const guias = GUIAS.map((g) => ({
    url: `${env.APP_URL}/guias/${g.slug}`,
    lastModified: new Date(g.actualizado),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...paginas, ...guias];
}
