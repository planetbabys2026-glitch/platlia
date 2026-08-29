"use server";

import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { readSession } from "@/lib/auth/session";
import { licenciaVigente } from "@/lib/auth/reglas";
// La sede se está eligiendo en este mismo formulario, así que no hay contexto de
// inquilino todavía; la membresía se verifica a mano, que es lo que lo reemplaza.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { VIDA_DEL_CODIGO_MS, generarSecreto, hashOpaco, redirectPermitido, urlDeRetorno } from "@/lib/mcp/oauth";
import { autorizarSchema } from "./schemas";

/**
 * El dueño dijo que sí: se emite el código y se lo manda de vuelta.
 *
 * Esto NO pasa por `defineAction` porque todavía no hay sede elegida —justamente
 * se elige acá—, así que las tres verificaciones que el wrapper hace por todos van
 * a mano y en este orden: que quien aprueba sea PROPIETARIO **de esa** sede, que
 * la licencia esté vigente, y que la dirección de retorno sea una de las que la
 * aplicación registró.
 *
 * La del medio importa tanto como las otras: es un POST alcanzable con curl, así
 * que la pantalla filtrando las sedes vencidas no es la seguridad, es la cortesía.
 */
export async function autorizar(_estado: unknown, formData: FormData) {
  const parseado = autorizarSchema.safeParse({
    businessId: formData.get("businessId"),
    clientId: formData.get("clientId"),
    redirectUri: formData.get("redirectUri"),
    codeChallenge: formData.get("codeChallenge"),
    state: formData.get("state") ?? undefined,
  });
  if (!parseado.success) return { error: "La petición está incompleta." };
  const input = parseado.data;

  const sesion = await readSession("APP");
  if (!sesion) return { error: "Se cerró tu sesión. Ingresá de nuevo." };

  const cliente = await rootDb.oAuthClient.findUnique({
    where: { clientId: input.clientId },
    select: { redirectUris: true },
  });
  if (!cliente || !redirectPermitido(input.redirectUri, cliente.redirectUris)) {
    // No se redirige: mandar un `error=` a una dirección que no verificamos sería
    // usar a Platlia de trampolín hacia donde quiera el que armó el enlace.
    return { error: "La aplicación o su dirección de retorno no están registradas." };
  }

  const membresia = await rootDb.membership.findUnique({
    where: { userId_businessId: { userId: sesion.userId, businessId: input.businessId } },
    select: {
      active: true,
      role: true,
      business: {
        select: {
          status: true,
          subscription: {
            select: { status: true, currentPeriodEnd: true, trialEndsAt: true, graceUntil: true },
          },
        },
      },
    },
  });
  if (!membresia?.active || membresia.role !== Role.PROPIETARIO) {
    return { error: "Solo el propietario de esa sede puede autorizar el acceso." };
  }
  if (
    membresia.business.status !== "ACTIVO" ||
    !licenciaVigente(membresia.business.subscription).vigente
  ) {
    return { error: "La licencia de esa sede no está vigente." };
  }

  const codigo = generarSecreto();
  await rootDb.oAuthCode.create({
    data: {
      businessId: input.businessId,
      codeHash: hashOpaco(codigo),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      userId: sesion.userId,
      expiresAt: new Date(Date.now() + VIDA_DEL_CODIGO_MS),
    },
  });

  await rootDb.auditLog.create({
    data: {
      businessId: input.businessId,
      userId: sesion.userId,
      action: "ia.conexion.autorizar",
      entity: "OAuthClient",
      entityId: input.clientId,
    },
  });

  redirect(urlDeRetorno(input.redirectUri, { code: codigo, state: input.state ?? null }));
}
