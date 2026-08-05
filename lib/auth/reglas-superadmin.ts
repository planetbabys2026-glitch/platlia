/**
 * Quién puede quitarle el acceso a otro superadministrador.
 *
 * A diferencia del equipo de un negocio, acá no hay jerarquía de roles —todo
 * superadministrador puede editar, resetear la contraseña o dar de alta a
 * cualquier otro—: son el mismo equipo de confianza. La única regla real es la
 * que impide los dos accidentes que dejan a la plataforma entera sin nadie que
 * pueda entrar: quitarse el acceso a uno mismo, y quitarle el acceso al último
 * que queda.
 *
 * Sin imports, para que tenga tests.
 */

export type ActorSuperAdmin = { userId: string };
export type ObjetivoSuperAdmin = { userId: string };

export type Veredicto = { permitido: true } | { permitido: false; motivo: string };

const PERMITIDO: Veredicto = { permitido: true };
const no = (motivo: string): Veredicto => ({ permitido: false, motivo });

export function puedeQuitarSuperAdmin(
  actor: ActorSuperAdmin,
  objetivo: ObjetivoSuperAdmin,
  superadminsActivos: number,
): Veredicto {
  if (actor.userId === objetivo.userId) {
    return no("No podés quitarte tu propio acceso. Pedíselo a otro superadministrador.");
  }
  if (superadminsActivos <= 1) {
    return no("Es el único superadministrador: la plataforma no puede quedarse sin ninguno.");
  }
  return PERMITIDO;
}
