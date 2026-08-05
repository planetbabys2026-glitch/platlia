import "server-only";
import { createHash, randomBytes } from "node:crypto";
// Auth: token de verificación de correo y de recuperación de contraseña, antes
// de que exista sesión ni businessId con el que acotar. Una de las tres
// excepciones previstas por la regla (auth, billing, superadmin).
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import type { VerificationTokenPurpose } from "@/generated/prisma/enums";

/**
 * Enlace de un solo uso: verificar el correo o restablecer la contraseña.
 *
 * Se guarda el hash del token, nunca el token en sí —igual que una contraseña—
 * porque una fila de esta tabla filtrada no puede regalar la cuenta de nadie. El
 * valor que viaja por la URL solo existe en el correo que se manda una vez.
 */

const HORA_MS = 3_600_000;

const VIGENCIA: Record<VerificationTokenPurpose, number> = {
  // Generoso: saber el propio correo no da acceso a nada, solo marca la cuenta
  // como confirmada.
  EMAIL_VERIFICATION: 7 * 24 * HORA_MS,
  // Corto: un enlace de recuperación vivo es una puerta a la cuenta.
  PASSWORD_RESET: HORA_MS,
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Emite un token nuevo y borra los anteriores del mismo usuario y propósito que
 * seguían sin usar, para que nunca haya dos enlaces vivos compitiendo por ser
 * "el" válido —el último correo mandado es siempre el que funciona.
 *
 * Devuelve el token crudo: es la única vez que existe fuera del correo que se
 * manda con él.
 */
export async function emitirToken(
  userId: string,
  purpose: VerificationTokenPurpose,
): Promise<string> {
  const crudo = randomBytes(32).toString("base64url");

  await rootDb.$transaction([
    rootDb.verificationToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    rootDb.verificationToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(crudo),
        expiresAt: new Date(Date.now() + VIGENCIA[purpose]),
      },
    }),
  ]);

  return crudo;
}

/** Hace cuánto se emitió el último token vivo (usado o no) de este usuario y propósito. */
export async function emitidoHaceMenosDe(
  userId: string,
  purpose: VerificationTokenPurpose,
  ventanaMs: number,
): Promise<boolean> {
  const ultimo = await rootDb.verificationToken.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return Boolean(ultimo && Date.now() - ultimo.createdAt.getTime() < ventanaMs);
}

export type ResultadoConsumo =
  | { ok: true; userId: string }
  | { ok: false; motivo: "invalido" | "vencido" | "usado" };

/**
 * Valida un token y lo marca usado en el mismo paso.
 *
 * Un token no encontrado y uno con el propósito equivocado dan el mismo motivo
 * ("invalido"): no hay que decirle a quien mira un enlace roto si el problema es
 * que no existe o que es de otra cosa.
 */
export async function consumirToken(
  raw: string,
  purpose: VerificationTokenPurpose,
): Promise<ResultadoConsumo> {
  const token = await rootDb.verificationToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
  });

  if (!token || token.purpose !== purpose) return { ok: false, motivo: "invalido" };
  if (token.usedAt) return { ok: false, motivo: "usado" };
  if (token.expiresAt <= new Date()) return { ok: false, motivo: "vencido" };

  await rootDb.verificationToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });

  return { ok: true, userId: token.userId };
}
