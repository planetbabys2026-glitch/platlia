import { env } from "@/lib/env";

/**
 * Dónde queda cada cosa del flujo de autorización (RFC 8414).
 *
 * Los nombres de estas rutas son superficie del protocolo y no del producto, así
 * que van en inglés y con los nombres de siempre: un cliente que no encuentre el
 * documento las adivina, y las que adivina son estas.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      issuer: env.APP_URL,
      authorization_endpoint: `${env.APP_URL}/authorize`,
      token_endpoint: `${env.APP_URL}/api/oauth/token`,
      registration_endpoint: `${env.APP_URL}/api/oauth/register`,
      scopes_supported: ["mcp:leer"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // Solo S256: `plain` manda el verificador a la vista, y entonces ver pasar
      // la petición alcanza para canjear el código.
      code_challenge_methods_supported: ["S256"],
      // Aplicaciones públicas: corren en el equipo de la gente y no pueden
      // guardar un secreto, así que lo que las ata es PKCE y la dirección de
      // retorno registrada.
      token_endpoint_auth_methods_supported: ["none"],
    },
    {
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
    },
  );
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
