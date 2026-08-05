import type { Role } from "@/generated/prisma/enums";

/**
 * Las dos decisiones de autorización que son lógica pura: si la licencia deja
 * trabajar hoy y si un rol alcanza.
 *
 * Viven acá, sin un solo import de runtime, porque `lib/auth/dal.ts` importa
 * "server-only" —arrastra Prisma y la sesión— y estas reglas tienen que poder
 * probarse solas. Son la clase de código donde un error no rompe nada visible:
 * simplemente deja entrar a quien no debía.
 */

export type EstadoLicencia = {
  vigente: boolean;
  /** Vencida pero dentro de los días de gracia: se trabaja, con aviso. */
  enGracia: boolean;
  venceEl: Date | null;
};

export type SuscripcionParaLicencia = {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
} | null;

/**
 * ¿La licencia deja trabajar?
 *
 * Se compara contra `graceUntil` y no contra `currentPeriodEnd`: el día que un
 * pago falla, el bar no puede quedarse sin poder cobrar en mitad de un viernes.
 * Primero avisa, después bloquea. Una suscripción cancelada o suspendida a mano
 * no tiene gracia: esas son decisiones, no accidentes de cobro.
 */
export function licenciaVigente(
  sub: SuscripcionParaLicencia,
  ahora = new Date(),
): EstadoLicencia {
  if (!sub) return { vigente: false, enGracia: false, venceEl: null };

  if (sub.status === "CANCELADA" || sub.status === "SUSPENDIDA") {
    return { vigente: false, enGracia: false, venceEl: sub.currentPeriodEnd };
  }

  const fin = sub.currentPeriodEnd ?? sub.trialEndsAt;
  const limite = sub.graceUntil ?? fin;

  return {
    vigente: limite !== null && limite > ahora,
    enGracia: fin !== null && fin <= ahora && limite !== null && limite > ahora,
    venceEl: fin,
  };
}

/** El propietario puede todo; el resto necesita estar en la lista. */
export function tieneRol(rol: Role, permitidos: readonly Role[]): boolean {
  return rol === "PROPIETARIO" || permitidos.includes(rol);
}
