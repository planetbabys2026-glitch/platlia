import { env } from "@/lib/env";

/**
 * "Soy un recurso protegido y mi autorización se pide acá" (RFC 9728).
 *
 * Es el primer eslabón del descubrimiento: el cliente pega en `/api/mcp` sin
 * credencial, la respuesta 401 le dice dónde está este documento, y de acá saca a
 * qué servidor ir a pedir permiso. Sin esto no hay forma de conectar un cliente
 * que no acepte que le peguen un token a mano.
 */
export const dynamic = "force-dynamic";

export function metadatos() {
  return {
    resource: `${env.APP_URL}/api/mcp`,
    authorization_servers: [env.APP_URL],
    bearer_methods_supported: ["header"],
    resource_name: "Platlia",
    resource_documentation: `${env.APP_URL}/llms.txt`,
  };
}

export async function GET() {
  return Response.json(metadatos(), {
    headers: {
      // El descubrimiento lo hace el servidor del cliente, no el navegador, pero
      // algunos lo prueban desde una página: sin CORS ese intento falla y el
      // cliente reporta "no se pudo conectar" en vez de seguir de largo.
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
    },
  });
}
