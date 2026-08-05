import "server-only";
import { cookies, headers } from "next/headers";
import { rootDb } from "@/lib/db/root";
import { env } from "@/lib/env";
import {
  COOKIE_SESION,
  COOKIE_SUPERADMIN,
  DURACION_SESION_DIAS,
  type SessionKindToken,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/token";

/**
 * Ciclo de vida de la sesión: crearla, leerla y revocarla.
 *
 * La sesión vive en la tabla `Session` y la cookie solo lleva un token firmado
 * que apunta a esa fila. Cuesta una consulta por request —la memoiza el DAL con
 * `cache()`— y a cambio se puede cerrar una sesión desde el servidor, que es
 * innegociable en un producto donde el que se va enojado tenía la tablet.
 */

const DIA_MS = 86_400_000;

function opcionesCookie(expiresAt: Date, kind: SessionKindToken) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // La cookie de superadministrador no se manda al resto de la aplicación: una
    // sesión de soporte no tiene por qué viajar en cada request del producto.
    path: kind === "SUPERADMIN" ? "/superadmin" : "/",
    expires: expiresAt,
  };
}

/** Crea la fila de sesión y planta la cookie firmada. */
export async function createSession(opciones: {
  userId: string;
  businessId?: string | null;
  kind?: SessionKindToken;
}): Promise<void> {
  const kind = opciones.kind ?? "APP";
  const expiresAt = new Date(Date.now() + DURACION_SESION_DIAS * DIA_MS);

  const cabeceras = await headers();
  const sesion = await rootDb.session.create({
    data: {
      userId: opciones.userId,
      businessId: opciones.businessId ?? null,
      kind,
      expiresAt,
      // `x-forwarded-for` puede traer una cadena de proxies; interesa el primero.
      ip: cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: cabeceras.get("user-agent")?.slice(0, 500) ?? null,
    },
    select: { id: true },
  });

  const token = await signSessionToken(
    { sid: sesion.id, uid: opciones.userId, kind },
    expiresAt,
  );

  const cookieStore = await cookies();
  cookieStore.set(
    kind === "SUPERADMIN" ? COOKIE_SUPERADMIN : COOKIE_SESION,
    token,
    opcionesCookie(expiresAt, kind),
  );
}

export type SesionViva = {
  sessionId: string;
  userId: string;
  businessId: string | null;
  kind: SessionKindToken;
};

/**
 * Lee la sesión de la cookie y la valida contra la base.
 *
 * Devuelve null en todos los casos de "no hay sesión utilizable": sin cookie,
 * token corrupto, sesión revocada, vencida, o de un usuario suspendido. No
 * distingue entre ellos a propósito.
 */
export async function readSession(
  kind: SessionKindToken = "APP",
): Promise<SesionViva | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(kind === "SUPERADMIN" ? COOKIE_SUPERADMIN : COOKIE_SESION);
  if (!token?.value) return null;

  const claims = await verifySessionToken(token.value);
  if (!claims || claims.kind !== kind) return null;

  const sesion = await rootDb.session.findUnique({
    where: { id: claims.sid },
    select: {
      id: true,
      userId: true,
      businessId: true,
      kind: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { status: true, deletedAt: true, isSuperAdmin: true } },
    },
  });

  if (!sesion || sesion.kind !== kind) return null;
  if (sesion.revokedAt || sesion.expiresAt <= new Date()) return null;
  if (sesion.user.status !== "ACTIVO" || sesion.user.deletedAt) return null;
  if (kind === "SUPERADMIN" && !sesion.user.isSuperAdmin) return null;

  return {
    sessionId: sesion.id,
    userId: sesion.userId,
    businessId: sesion.businessId,
    kind,
  };
}

/** Cambia la empresa activa de la sesión, para quien trabaja en más de un negocio. */
export async function setSessionBusiness(sessionId: string, businessId: string) {
  await rootDb.session.update({
    where: { id: sessionId },
    data: { businessId },
  });
}

/** Cierra la sesión actual y borra la cookie. */
export async function destroySession(kind: SessionKindToken = "APP"): Promise<void> {
  const sesion = await readSession(kind);
  if (sesion) {
    await rootDb.session.update({
      where: { id: sesion.sessionId },
      data: { revokedAt: new Date() },
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete({
    name: kind === "SUPERADMIN" ? COOKIE_SUPERADMIN : COOKIE_SESION,
    path: kind === "SUPERADMIN" ? "/superadmin" : "/",
  });
}

/**
 * Revoca las sesiones de un usuario. Se usa al cambiar la contraseña y al dar de
 * baja a alguien: si el motivo para cambiarla fue que alguien más la sabía, dejar
 * sus sesiones abiertas no arregla nada.
 *
 * `kind` acota a un solo tipo de sesión. Hace falta para quitarle a alguien el
 * acceso de superadministrador sin de paso cerrarle la sesión que tenga como
 * cliente de un negocio: son dos cuentas de acceso independientes que comparten
 * usuario, y perder una no tiene por qué tocar la otra.
 */
export async function revokeAllSessions(
  userId: string,
  kind?: SessionKindToken,
): Promise<number> {
  const { count } = await rootDb.session.updateMany({
    where: { userId, revokedAt: null, ...(kind ? { kind } : {}) },
    data: { revokedAt: new Date() },
  });
  return count;
}
