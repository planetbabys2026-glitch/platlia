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

  const agentesDeIa = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-User",
    "PerplexityBot",
    "Google-Extended",
    "Applebot-Extended",
    "meta-externalagent",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: prohibido },
      ...agentesDeIa.map((userAgent) => ({ userAgent, allow: "/", disallow: prohibido })),
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: env.APP_URL,
  };
}
