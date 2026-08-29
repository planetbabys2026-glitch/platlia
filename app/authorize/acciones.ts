"use server";

import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { readSession } from "@/lib/auth/session";
import { licenciaVigente } from "@/lib/auth/reglas";
// La sede se está eligiendo en este mismo formulario, así que no hay contexto de
// inquilino todavía; la membresía se verifica a mano, que es lo que lo reemplaza.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import {
  VIDA_DEL_CODIGO_MS,
  generarSecreto,
  hashOpaco,
  decidirSobreCliente,
  nombreMostrable,
  urlDeRetorno,
} from "@/lib/mcp/oauth";
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


  /**
   * Acá se ata el `client_id` a su dirección de retorno, la primera vez.
   *
   * No todos los clientes usan el alta automática: en Claude.ai, por ejemplo, la
   * opción "usa tu propio cliente OAuth" manda el nombre que uno escribió y nunca
   * pasa por el registro. Cortar ahí hacía imposible conectar por ese camino.
   *
   * El alta se hace ACÁ y no al pintar la pantalla porque aquello es un GET:
   * cualquier robot que siguiera el enlace dejaría filas. Se escribe recién cuando
   * una persona con sesión aprueba.
   *
   * Desde este momento ese `client_id` no puede volver a ningún otro lado. Lo peor
   * que puede hacer alguien tomando un nombre conocido antes que su dueño es
   * dejarlo inservible para él —molesto, y nunca una filtración—, porque el código
   * seguiría yendo a la dirección atada y no a la suya.
   */
  const cliente = await rootDb.oAuthClient.findUnique({
    where: { clientId: input.clientId },
    select: { redirectUris: true },
  });

  const veredicto = decidirSobreCliente({
    registradas: cliente?.redirectUris ?? null,
    redirectUri: input.redirectUri,
  });

  if (veredicto === "RECHAZAR") {
    // No se redirige: mandar un `error=` a una dirección que no verificamos sería
    // usar a Platlia de trampolín hacia donde quiera el que armó el enlace.
    return { error: "Esa no es la dirección con la que se registró esta aplicación." };
  }

  if (veredicto === "ATAR") {
    try {
      await rootDb.oAuthClient.create({
        data: {
          clientId: input.clientId,
          clientName: nombreMostrable(input.clientId),
          redirectUris: [input.redirectUri],
        },
      });
    } catch {
      // Alguien la creó entre la lectura y la escritura: se relee y se valida,
      // que es lo mismo que habría pasado si hubiera llegado un instante antes.
      const ahora = await rootDb.oAuthClient.findUnique({
        where: { clientId: input.clientId },
        select: { redirectUris: true },
      });
      if (
        decidirSobreCliente({ registradas: ahora?.redirectUris ?? null, redirectUri: input.redirectUri }) !==
        "SEGUIR"
      ) {
        return { error: "Esa no es la dirección con la que se registró esta aplicación." };
      }
    }
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
