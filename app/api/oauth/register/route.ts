// eslint-disable-next-line no-restricted-imports -- OAuth es de la plataforma, no de un negocio: acá todavía no se sabe de qué sede va a ser la llave.
import { rootDb } from "@/lib/db/root";
import { generarSecreto, redirectRegistrableEs } from "@/lib/mcp/oauth";

/**
 * Una aplicación se da de alta sola (RFC 7591).
 *
 * Nadie va a pedirnos por correo que le demos de alta su ChatGPT. El cliente MCP
 * se registra en el momento, recibe un `client_id` y recién entonces manda a la
 * persona a autorizar. **Registrarse no da acceso a nada**: lo único que se
 * consigue acá es un identificador y la promesa de que el código de autorización
 * va a viajar a esa dirección y no a otra. El acceso lo da un dueño aprobándolo
 * en pantalla, y solo a la sede que elija.
 *
 * Por eso no hay secreto de cliente: son aplicaciones que corren en el equipo de
 * la gente y no pueden guardarlo. Lo que las ata es PKCE y la dirección de retorno.
 */
export const dynamic = "force-dynamic";

const MAX_REDIRECTS = 10;

function error(descripcion: string, codigo = "invalid_client_metadata") {
  return Response.json(
    { error: codigo, error_description: descripcion },
    { status: 400, headers: { "access-control-allow-origin": "*" } },
  );
}

export async function POST(req: Request) {
  let cuerpo: { client_name?: unknown; redirect_uris?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return error("El cuerpo no es JSON válido.");
  }

  const uris = Array.isArray(cuerpo.redirect_uris) ? cuerpo.redirect_uris : null;
  if (!uris || uris.length === 0) return error("Hace falta al menos una redirect_uri.");
  if (uris.length > MAX_REDIRECTS) return error("Demasiadas redirect_uris.");
  if (!uris.every((u): u is string => typeof u === "string" && redirectRegistrableEs(u))) {
    return error("Toda redirect_uri tiene que ser https (o localhost) y sin fragmento.");
  }

  const nombre =
    typeof cuerpo.client_name === "string" && cuerpo.client_name.trim()
      ? cuerpo.client_name.trim().slice(0, 120)
      : "Aplicación sin nombre";

  const clientId = `plt_cli_${generarSecreto(16)}`;
  try {
    await rootDb.oAuthClient.create({
      data: { clientId, clientName: nombre, redirectUris: uris },
    });
  } catch (e) {
    // Del otro lado hay un cliente esperando JSON: un 500 de Next lo deja sin
    // ningún diagnóstico y reporta "no se pudo conectar", que manda a revisar
    // justo lo que no está mal.
    console.error("[oauth] no se pudo registrar la aplicación:", e);
    return Response.json(
      { error: "temporarily_unavailable", error_description: "Probá de nuevo en un momento." },
      { status: 503, headers: { "access-control-allow-origin": "*" } },
    );
  }

  return Response.json(
    {
      client_id: clientId,
      client_name: nombre,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: { "access-control-allow-origin": "*" } },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
