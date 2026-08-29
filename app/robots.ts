import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Qué puede leer un buscador y qué no.
 *
 * No existía, así que hasta acá los rastreadores entraban a todo por defecto:
 * la consola de superadministración, las pantallas de trabajo, los tiquetes de
 * impresión con datos de clientes y las rutas de la API. Nada de eso tiene por
 * qué estar en un índice público, y algunas —los tiquetes— traen el nombre y el
 * teléfono de comensales reales.
 *
 * **A los agentes de IA se les da permiso explícito.** Muchos leen el `robots`
 * antes de indexar y, cuando encuentran solo reglas para Googlebot, algunos se
 * abstienen. Como parte del tráfico hoy llega por una respuesta de un asistente
 * —"¿qué software uso para mi bar en Colombia?"— conviene nombrarlos.
 *
 * **Pero solo los que contestan, no los que entrenan.** Cloudflare antepone su
 * propio bloque a este archivo (`# BEGIN Cloudflare Managed content`) y ahí los
 * rastreadores de entrenamiento —ClaudeBot, GPTBot, CCBot, Google-Extended,
 * meta-externalagent, Applebot-Extended— llevan `Disallow: /`. Nombrarlos acá con
 * `Allow: /` no los desbloquea: deja **dos grupos `User-agent` con el mismo
 * nombre diciendo lo opuesto**, y con grupos duplicados el comportamiento no está
 * definido igual en todos los rastreadores —los conservadores toman la primera
 * coincidencia, que es la de Cloudflare—. O sea que la contradicción no nos daba
 * nada y volvía impredecible el archivo entero.
 *
 * Los cuatro que quedan son los que de verdad importan para aparecer en una
 * respuesta, y Cloudflare **no** los bloquea, así que acá no hay conflicto:
 *
 * | Agente | Qué hace |
 * |---|---|
 * | `Claude-User` | entra a la página cuando alguien le pregunta a Claude |
 * | `ChatGPT-User` | lo mismo, del lado de ChatGPT |
 * | `OAI-SearchBot` | arma el índice de búsqueda de ChatGPT |
 * | `PerplexityBot` | arma el de Perplexity |
 *
 * Lo que se pierde bloqueando a los otros es entrar al **corpus de
 * entrenamiento**: que el modelo te conozca sin tener que buscar. Es una decisión
 * de negocio y está tomada a propósito —el contenido se protege del
 * entrenamiento—, no un olvido. Si algún día se apaga el robots.txt gestionado de
 * Cloudflare (panel → AI Crawl Control), acá se pueden sumar los otros y hay que
 * actualizar `tests/unit/robots.test.ts`, que fija justamente esto.
 *
 * Y `Google-Extended` no se nombra porque no hace falta discutirlo: solo controla
 * si el contenido alimenta a Gemini. **No tiene ningún efecto sobre el
 * posicionamiento en la Búsqueda de Google**, que es el que importa acá.
 */
export default function robots(): MetadataRoute.Robots {
  // Lo que nunca se indexa: pantallas con sesión, la consola de soporte, los
  // tiquetes con datos de comensales, y todo lo que cuelga de la API.
  const prohibido = [
    "/api/",
    "/superadmin",
    "/superadmin/",
    "/imprimir/",
    "/elegir-negocio",
    "/bloqueado",
    "/pl-bootstrap",
    "/restablecer-contrasena",
    "/verificar-correo",
    "/turnero",
    // Las pantallas de trabajo. Están detrás de sesión, pero pedirlo acá evita
    // que un rastreador gaste presupuesto en cientos de redirecciones al login.
    "/salon",
    "/pos",
    "/cocina",
    "/caja",
    "/domicilios",
    "/inventario",
    "/informes",
    "/administracion/",
    "/panel",
  ];

  /**
   * Solo los que contestan una pregunta en el momento o arman un índice de
   * búsqueda. Los de entrenamiento van afuera: Cloudflare ya los bloquea y
   * nombrarlos acá solo creaba un grupo duplicado que se contradice. Ver el
   * comentario de arriba.
   */
  const agentesDeIa = ["OAI-SearchBot", "ChatGPT-User", "Claude-User", "PerplexityBot"];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: prohibido },
      ...agentesDeIa.map((userAgent) => ({ userAgent, allow: "/", disallow: prohibido })),
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: env.APP_URL,
  };
}
