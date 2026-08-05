import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

/**
 * Firma y verificación del token de sesión.
 *
 * Este módulo es deliberadamente pobre: solo criptografía y constantes, sin base
 * de datos ni `cookies()`. Es lo único de autenticación que puede importar
 * `middleware.ts`, que corre en el runtime edge —donde no hay Prisma ni sockets—
 * y donde `server-only` reventaría.
 *
 * El token NO es la sesión: es un puntero firmado a la fila de `Session`. Quien
 * decide si la sesión sigue viva es el DAL contra la base, que es lo que permite
 * revocarla de verdad cuando se despide a alguien o se pierde una tablet.
 */

export const COOKIE_SESION = "pl_session";
export const COOKIE_SUPERADMIN = "pl_sa";

/** 30 días: en un bar la tablet del salón no puede pedir contraseña cada mañana. */
export const DURACION_SESION_DIAS = 30;

export type SessionKindToken = "APP" | "SUPERADMIN";

export type SessionClaims = {
  /** Id de la fila en `Session`. */
  sid: string;
  /** Id del usuario, solo para trazas: la autorización se resuelve en la base. */
  uid: string;
  kind: SessionKindToken;
};

const clave = new TextEncoder().encode(env.SESSION_SECRET);
const ALGORITMO = "HS256";

export async function signSessionToken(
  claims: SessionClaims,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ uid: claims.uid, kind: claims.kind })
    .setProtectedHeader({ alg: ALGORITMO })
    .setSubject(claims.sid)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(clave);
}

/**
 * Devuelve los claims si el token está bien firmado y no venció, o null.
 * Nunca lanza: un token corrupto o vencido es simplemente "no hay sesión".
 */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, clave, { algorithms: [ALGORITMO] });
    const kind = payload.kind;
    if (!payload.sub || typeof payload.uid !== "string") return null;
    if (kind !== "APP" && kind !== "SUPERADMIN") return null;
    return { sid: payload.sub, uid: payload.uid, kind };
  } catch {
    return null;
  }
}
