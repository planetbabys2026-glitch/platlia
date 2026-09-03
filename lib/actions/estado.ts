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

/**
 * Error cuyo mensaje SÍ se le muestra al usuario tal cual.
 *
 * Existe para transmitir mensajes amigables como "stock insuficiente", "esa mesa ya está ocupada".
 */
export class ErrorDeUsuario extends Error {
  readonly campos?: Record<string, string[]>;

  constructor(mensaje: string, campos?: Record<string, string[]>) {
    super(mensaje);
    this.name = "ErrorDeUsuario";
    this.campos = campos;
  }
}

/**
 * El nombre del campo trampa.
 *
 * Vive acá por lo mismo que `EstadoAccion`: lo necesitan los dos lados. Lo pinta
 * un componente cliente y lo lee `definePublicAction` en el servidor, y ese
 * módulo tiene `server-only` —importarlo desde el navegador rompe el build—. Con
 * la cadena escrita en cada lado, cambiarla en uno apaga la trampa sin que nada
 * falle: el campo seguiría existiendo y el servidor miraría otro que nadie manda.
 */
export const CAMPO_TRAMPA = "sitio";
