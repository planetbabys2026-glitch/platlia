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

/**
 * Enganchar a este negocio una cuenta que YA existe.
 *
 * `User` es global —la misma persona puede ser mesera en dos bares— y su correo
 * es único, así que al dar de alta a alguien que ya tiene cuenta no hay opción
 * de "crear otra": o se engancha la que hay, o se rechaza.
 *
 * Enganchar de más era una puerta abierta y no una comodidad. Con una prueba
 * gratis alcanzaba para agregar al dueño de otro negocio como mesero y, desde
 * ahí, resetearle la contraseña —que es global— y entrar a SU negocio. Esa
 * cadena la corta esta regla junto con `puedeRestablecerContrasenaGlobal`; hace
 * falta que estén las dos.
 *
 * Lo que sí tiene que seguir funcionando, y es el caso que más importa: la misma
 * persona trabajando en dos sucursales de la misma cuenta. Ahí el dueño ya
 * controla los dos negocios, así que no se cruza ninguna frontera de confianza.
 *
 * Al empleado de un negocio ajeno se lo deja pasar a propósito: un mesero que
 * trabaja en dos restaurantes distintos existe de verdad, y lo que lo protege es
 * que su contraseña ya no se puede resetear desde acá.
 */
export function puedeVincularCuentaExistente(candidato: {
  /** Es PROPIETARIO de algún negocio que no pertenece a esta cuenta. */
  esPropietarioAfuera: boolean;
}): Veredicto {
  if (candidato.esPropietarioAfuera) {
    return no(
      "Ese correo es de alguien que ya tiene su propio negocio en Platlia. " +
        "Si trabaja con vos, pedile que use otro correo para esta cuenta.",
    );
  }
  return PERMITIDO;
}

/**
 * Ponerle una contraseña nueva a alguien, sabiendo que la contraseña es GLOBAL.
 *
 * `puedeRestablecerContrasena` decide con los roles de este negocio, que es lo
 * correcto puertas adentro. Lo que no ve es que `User.passwordHash` no es de
 * este negocio: es de la persona. Reseteársela a alguien que además trabaja en
 * otro lado no le cambia la clave "acá", le cambia la única que tiene, y de paso
 * se la entrega a quien la escribió.
 *
 * Por eso, cuando la persona tiene cuentas afuera, la salida es el enlace de
 * recuperación: lo elige ella y nadie más lo conoce. No es una restricción
 * incómoda por precaución, es la diferencia entre cambiarle la clave a un
 * empleado y quedarse con la llave de su otro negocio.
 */
export function puedeRestablecerContrasenaGlobal(
  actor: Actor,
  objetivo: Objetivo,
  tieneCuentasFuera: boolean,
): Veredicto {
  const dentro = puedeRestablecerContrasena(actor, objetivo);
  if (!dentro.permitido) return dentro;

  // Cambiarse la propia contraseña nunca es un problema, tenga las cuentas que
  // tenga: ya es su dueña.
  if (actor.userId === objetivo.userId) return PERMITIDO;

  if (tieneCuentasFuera) {
    return no(
      "Esa persona usa el mismo correo en otro negocio de Platlia, así que su " +
        "contraseña no es solo de acá. Mandale un enlace de recuperación para que " +
        "la elija ella.",
    );
  }

  return PERMITIDO;
}
