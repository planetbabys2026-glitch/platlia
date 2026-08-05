/**
 * El estado que devuelve una Server Action.
 *
 * Vive aparte de `define-action.ts` porque lo necesitan los dos lados: el
 * servidor para construirlo y el formulario cliente para leerlo con
 * `useActionState`. Aquel módulo importa "server-only" —arrastra Prisma y la
 * sesión— y traerlo al bundle del navegador rompe el build.
 *
 * Sin imports a propósito: es una forma, no una dependencia.
 */

export type EstadoAccion<T = void> =
  | { ok: true; data: T; mensaje?: string }
  | { ok: false; error: string; campos?: Record<string, string[]> };

/** Estado inicial para `useActionState`: todavía no se envió nada. */
export const ESTADO_INICIAL = { ok: false, error: "" } as const;
