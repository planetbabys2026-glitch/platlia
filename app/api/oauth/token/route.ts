// eslint-disable-next-line no-restricted-imports -- OAuth es de la plataforma: la sede sale del código aprobado, no del contexto.
import { rootDb } from "@/lib/db/root";
import { licenciaVigente } from "@/lib/auth/reglas";
import {
  VIDA_DE_LA_LLAVE_MS,
  generarSecreto,
  hashOpaco,
  verificadorCoincide,
} from "@/lib/mcp/oauth";
import { PREFIJO_TOKEN } from "@/lib/mcp/token";

/**
 * El canje: un código aprobado se vuelve una llave, o una llave vencida se renueva.
 *
 * Tres cosas que sostienen todo el flujo y que son fáciles de escribir mal:
 *
 * 1. **El código se quema en el mismo `updateMany` con que se reclama.** Es el
 *    patrón que ya usa el reclamo de impresión y la guarda anti-doble-emisión ante
 *    la DIAN: si se leyera primero y se marcara después, dos canjes simultáneos del
 *    mismo código darían dos llaves. Y un código robado que ya se usó no sirve.
 * 2. **El verificador de PKCE se comprueba contra el desafío guardado**, que es lo
 *    único que ata el canje a quien empezó el flujo: sin eso, robar el código de la
 *    barra de direcciones alcanza para llevarse la información del negocio.
 * 3. **La dirección de retorno tiene que ser la misma** que la de la autorización.
 */
export const dynamic = "force-dynamic";

function error(codigo: string, descripcion: string, status = 400) {
  return Response.json(
    { error: codigo, error_description: descripcion },
    { status, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } },
  );
}

function llaveNueva(expiraEn: Date, token: string, refresco: string) {
  return Response.json(
    {
      access_token: token,
      token_type: "Bearer",
      expires_in: Math.floor((expiraEn.getTime() - Date.now()) / 1000),
      refresh_token: refresco,
      scope: "mcp:leer",
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return error("invalid_request", "Se esperaba un formulario.");

  const leer = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };
  const grant = leer("grant_type");
  const clientId = leer("client_id");

  if (grant === "refresh_token") {
    const refresco = leer("refresh_token");
    if (!refresco) return error("invalid_request", "Falta refresh_token.");

    const fila = await rootDb.tokenIa.findUnique({
      where: { refreshHash: hashOpaco(refresco) },
      select: { id: true, clientId: true },
    });
    // Un refresco que no existe y uno de otra aplicación se contestan igual: decir
    // cuál de los dos fue le diría a quien esté probando cuál intento estuvo cerca.
    if (!fila || (clientId && fila.clientId !== clientId)) {
      return error("invalid_grant", "El refresco no es válido.");
    }

    const token = PREFIJO_TOKEN + generarSecreto();
    const nuevoRefresco = generarSecreto();
    const expiraEn = new Date(Date.now() + VIDA_DE_LA_LLAVE_MS);
    // El refresco se rota en cada uso: si uno viejo se filtró, deja de servir en
    // cuanto el cliente legítimo renueva.
    await rootDb.tokenIa.update({
      where: { id: fila.id },
      data: { tokenHash: hashOpaco(token), refreshHash: hashOpaco(nuevoRefresco), expiresAt: expiraEn },
    });
    return llaveNueva(expiraEn, token, nuevoRefresco);
  }

  if (grant !== "authorization_code") {
    return error("unsupported_grant_type", "Solo se admiten authorization_code y refresh_token.");
  }

  const codigo = leer("code");
  const redirectUri = leer("redirect_uri");
  const verificador = leer("code_verifier");
  if (!codigo || !redirectUri || !verificador || !clientId) {
    return error("invalid_request", "Faltan parámetros del canje.");
  }

  // Se reclama y se quema de una: dos canjes del mismo código no dan dos llaves.
  const { count } = await rootDb.oAuthCode.updateMany({
    where: { codeHash: hashOpaco(codigo), usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0) return error("invalid_grant", "El código no es válido, ya se usó o venció.");

  const fila = await rootDb.oAuthCode.findUnique({
    where: { codeHash: hashOpaco(codigo) },
    select: {
      businessId: true,
      clientId: true,
      redirectUri: true,
      codeChallenge: true,
      userId: true,
      business: {
        select: {
          name: true,
          status: true,
          subscription: {
            select: { status: true, currentPeriodEnd: true, trialEndsAt: true, graceUntil: true },
          },
        },
      },
    },
  });
  if (!fila) return error("invalid_grant", "El código no es válido.");

  if (fila.clientId !== clientId) return error("invalid_grant", "El código es de otra aplicación.");
  if (fila.redirectUri !== redirectUri) {
    return error("invalid_grant", "La dirección de retorno no es la de la autorización.");
  }
  if (!verificadorCoincide(verificador, fila.codeChallenge)) {
    return error("invalid_grant", "El verificador no corresponde al desafío.");
  }

  // La licencia se mira también acá: entre que el dueño aprobó y el cliente canjeó
  // pudo cortarse, y emitir una llave sobre una cuenta vencida sería una conexión
  // que nace muerta y confunde al que la instala.
  if (fila.business.status !== "ACTIVO" || !licenciaVigente(fila.business.subscription).vigente) {
    return error("invalid_grant", "La licencia del negocio no está vigente.", 403);
  }

  const cliente = await rootDb.oAuthClient.findUnique({
    where: { clientId },
    select: { clientName: true },
  });

  const token = PREFIJO_TOKEN + generarSecreto();
  const refresco = generarSecreto();
  const expiraEn = new Date(Date.now() + VIDA_DE_LA_LLAVE_MS);

  await rootDb.tokenIa.create({
    data: {
      businessId: fila.businessId,
      // El nombre lo pone la aplicación que pidió, para que en la lista del dueño
      // se lea "Claude" y no un identificador: revocar es reconocer cuál es cuál.
      nombre: cliente?.clientName ?? "Asistente de IA",
      tokenHash: hashOpaco(token),
      refreshHash: hashOpaco(refresco),
      expiresAt: expiraEn,
      clientId,
      createdById: fila.userId,
    },
  });

  return llaveNueva(expiraEn, token, refresco);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
  });
}
