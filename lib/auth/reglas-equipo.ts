import type { Role } from "@/generated/prisma/enums";

/**
 * Quién puede hacerle qué a quién dentro del equipo.
 *
 * Lógica pura y con tests porque son las reglas que impiden los dos accidentes
 * que dejan a un negocio sin dueño: que el último propietario se degrade solo, y
 * que un administrador se ascienda a propietario por su cuenta.
 *
 * Sin imports de runtime: solo el tipo del rol.
 */

export type Actor = { userId: string; role: Role };
export type Objetivo = { userId: string; role: Role; active: boolean };

export type Veredicto = { permitido: true } | { permitido: false; motivo: string };

const PERMITIDO: Veredicto = { permitido: true };
const no = (motivo: string): Veredicto => ({ permitido: false, motivo });

/**
 * Solo un propietario reparte el rol de propietario.
 *
 * Sin esta regla, cualquier administrador se asciende y el dueño pierde el
 * control de su propio negocio sin enterarse.
 */
export function puedeAsignarRol(actor: Actor, rol: Role): Veredicto {
  if (rol === "PROPIETARIO" && actor.role !== "PROPIETARIO") {
    return no("Solo el propietario puede nombrar a otro propietario.");
  }
  if (actor.role !== "PROPIETARIO" && actor.role !== "ADMINISTRADOR") {
    return no("Tu rol no permite administrar el equipo.");
  }
  return PERMITIDO;
}

/**
 * Cambiarle el rol a alguien.
 *
 * `propietariosActivos` cuenta los que quedarían habilitados; degradar al último
 * deja el negocio sin nadie que pueda nombrar a otro.
 */
export function puedeCambiarRol(
  actor: Actor,
  objetivo: Objetivo,
  rolNuevo: Role,
  propietariosActivos: number,
): Veredicto {
  if (actor.userId === objetivo.userId) {
    return no("No podés cambiarte el rol a vos mismo. Pediselo a otro propietario.");
  }

  const asignar = puedeAsignarRol(actor, rolNuevo);
  if (!asignar.permitido) return asignar;

  // Tocar a un propietario es cosa de propietarios.
  if (objetivo.role === "PROPIETARIO" && actor.role !== "PROPIETARIO") {
    return no("Solo un propietario puede cambiarle el rol a otro propietario.");
  }

  if (objetivo.role === "PROPIETARIO" && rolNuevo !== "PROPIETARIO" && propietariosActivos <= 1) {
    return no("Es el único propietario: el negocio no puede quedarse sin uno.");
  }

  return PERMITIDO;
}

/** Dar de baja o volver a habilitar a alguien. */
export function puedeCambiarEstado(
  actor: Actor,
  objetivo: Objetivo,
  activar: boolean,
  propietariosActivos: number,
): Veredicto {
  if (actor.userId === objetivo.userId) {
    return no("No podés darte de baja a vos mismo.");
  }
  if (actor.role !== "PROPIETARIO" && actor.role !== "ADMINISTRADOR") {
    return no("Tu rol no permite administrar el equipo.");
  }
  if (objetivo.role === "PROPIETARIO" && actor.role !== "PROPIETARIO") {
    return no("Solo un propietario puede dar de baja a otro propietario.");
  }
  if (!activar && objetivo.role === "PROPIETARIO" && propietariosActivos <= 1) {
    return no("Es el único propietario: el negocio no puede quedarse sin uno.");
  }
  return PERMITIDO;
}

/**
 * Ponerle una contraseña nueva a alguien.
 *
 * Se permite sobre uno mismo: cambiarse la propia contraseña nunca deja a nadie
 * afuera. Lo que no se permite es que un administrador le cambie la contraseña
 * al propietario, que equivaldría a quedarse con el negocio.
 */
export function puedeRestablecerContrasena(actor: Actor, objetivo: Objetivo): Veredicto {
  if (actor.role !== "PROPIETARIO" && actor.role !== "ADMINISTRADOR") {
    return no("Tu rol no permite administrar el equipo.");
  }
  if (
    objetivo.role === "PROPIETARIO" &&
    actor.role !== "PROPIETARIO" &&
    actor.userId !== objetivo.userId
  ) {
    return no("Solo un propietario puede cambiarle la contraseña a otro propietario.");
  }
  return PERMITIDO;
}
