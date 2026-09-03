"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import {
  agregarEmpleadoSchema,
  cambiarEstadoSchema,
  cambiarRolSchema,
  mandarEnlaceSchema,
  restablecerContrasenaSchema,
} from "@/features/equipo/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { hashPassword } from "@/lib/auth/password";
import {
  puedeAsignarRol,
  puedeCambiarEstado,
  puedeCambiarRol,
  puedeRestablecerContrasenaGlobal,
  puedeVincularCuentaExistente,
} from "@/lib/auth/reglas-equipo";
import { sedesDeLaMismaCuenta } from "@/lib/billing/cuenta";
import { revokeAllSessions } from "@/lib/auth/session";
import { enviarCorreo } from "@/lib/email/enviar";
import { enviarCorreoDespues } from "@/lib/email/despues";
import { correoDeBienvenida, correoDeRecuperacion } from "@/lib/email/plantillas";
import { emitirToken } from "@/features/auth/tokens";
import { env } from "@/lib/env";
// El usuario es global —la misma persona puede trabajar en dos negocios—, así que
// crearlo y buscarlo por correo cruza empresas por definición. Es una de las tres
// excepciones previstas por la regla (auth, billing, superadmin).
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import type { TenantDb } from "@/lib/db/tenant";

const ADMINISTRAN = [Role.ADMINISTRADOR] as const;

/** Cuántos propietarios habilitados quedan. La usan casi todas las barandas. */
async function contarPropietarios(db: TenantDb): Promise<number> {
  return db.membership.count({ where: { role: Role.PROPIETARIO, active: true } });
}

/** Carga la membresía objetivo, ya acotada a la empresa de la sesión. */
async function cargarObjetivo(db: TenantDb, membershipId: string) {
  const membresia = await db.membership.findFirst({
    where: { id: membershipId },
    select: {
      id: true,
      role: true,
      active: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!membresia) throw new ErrorDeUsuario("Esa persona no trabaja en este negocio.");
  return membresia;
}

export const agregarEmpleado = defineAction({
  schema: agregarEmpleadoSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const veredicto = puedeAsignarRol({ userId: ctx.user.id, role: ctx.role }, input.role);
    if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);

    // Si ya tiene cuenta —porque trabaja en otro negocio— se le suma la membresía
    // en vez de crearle una cuenta nueva, y NO se le toca la contraseña: es suya.
    const existente = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true },
    });

    let userId = existente?.id;
    let reutilizado = false;

    if (existente) {
      reutilizado = true;
      const yaEsta = await db.membership.findFirst({
        where: { userId: existente.id },
        select: { id: true, active: true },
      });
      if (yaEsta?.active) {
        throw new ErrorDeUsuario(`${input.email} ya trabaja en este negocio.`);
      }
      if (yaEsta) {
        await db.membership.update({
          where: { id: yaEsta.id },
          data: { active: true, role: input.role },
        });
        revalidatePath("/administracion/equipo");
        return { reutilizado: true, reactivado: true };
      }

      // Enganchar una cuenta que ya existe es la única opción que hay —el correo
      // es único global, así que no se puede "crear otra"—, y por eso hay que
      // mirar de quién es esa cuenta antes de sumarla.
      //
      // Lo que se busca son negocios que esta persona posea y que NO sean de
      // esta cuenta. Las sedes de la cuenta actual se descuentan a propósito:
      // el caso que tiene que seguir andando sin fricción es la misma persona
      // en dos sucursales del mismo dueño, y ahí el dueño ya controla las dos.
      const sedesPropias = await sedesDeLaMismaCuenta(rootDb, ctx.business.id);
      const negociosAfuera = await rootDb.membership.count({
        where: {
          userId: existente.id,
          role: Role.PROPIETARIO,
          active: true,
          business: { deletedAt: null, id: { notIn: sedesPropias } },
        },
      });

      const vinculo = puedeVincularCuentaExistente({
        esPropietarioAfuera: negociosAfuera > 0,
      });
      if (!vinculo.permitido) {
        // El intento fallido queda registrado, como el de la clave de salidas de
        // caja y el de la anulación: alguien probando correos de dueños ajenos
        // tiene que dejar rastro.
        await db.auditLog.create({
          data: {
            businessId: ctx.business.id,
            userId: ctx.user.id,
            action: "equipo.alta-rechazada",
            entity: "User",
            entityId: existente.id,
            metadata: { correo: input.email, motivo: "propietario-de-otro-negocio" },
          },
        });
        throw new ErrorDeUsuario(vinculo.motivo, { email: [vinculo.motivo] });
      }
    } else {
      const creado = await rootDb.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          // La crea el dueño en persona; no hay correo que verificar.
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });
      userId = creado.id;
    }

    await db.membership.create({
      data: { businessId: ctx.business.id, userId: userId!, role: input.role },
    });

    // Las otras tres acciones del equipo ya se auditaban y esta no, que es la
    // que suma a alguien: quién entró al negocio y cuándo es justamente lo que
    // se pregunta después.
    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "equipo.agregar",
        entity: "User",
        entityId: userId!,
        metadata: { persona: input.email, rol: input.role, cuentaExistente: reutilizado },
      },
    });

    // El aviso sale DESPUÉS de contestar. Que Resend esté caído no puede impedir
    // que el empleado quede dado de alta —eso ya lo cumplía `…SinBloquear`— pero
    // esperarlo igual hacía que el alta tardara lo que tarde el proveedor: ~430 ms
    // sobre una operación que en base tarda 62. Nunca lleva la contraseña —la
    // entrega el dueño en persona—, porque mandarla por correo la deja escrita
    // para siempre en un buzón que no controlamos.
    const bienvenida = correoDeBienvenida({
      nombre: input.name,
      negocio: ctx.business.name,
      rol: input.role,
      urlDeIngreso: `${env.APP_URL}/ingresar`,
    });
    enviarCorreoDespues({
      para: input.email,
      asunto: bienvenida.asunto,
      html: bienvenida.html,
      texto: bienvenida.texto,
      contexto: `bienvenida a ${input.email}`,
    });

    revalidatePath("/administracion/equipo");
    return { reutilizado, reactivado: false };
  },
});

export const cambiarRol = defineAction({
  schema: cambiarRolSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const objetivo = await cargarObjetivo(db, input.membershipId);
    const veredicto = puedeCambiarRol(
      { userId: ctx.user.id, role: ctx.role },
      objetivo,
      input.role,
      await contarPropietarios(db),
    );
    if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);

    await db.membership.update({ where: { id: objetivo.id }, data: { role: input.role } });

    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "equipo.rol.cambiar",
        entity: "Membership",
        entityId: objetivo.id,
        metadata: { persona: objetivo.user.email, de: objetivo.role, a: input.role },
      },
    });

    revalidatePath("/administracion/equipo");
  },
});

export const cambiarEstadoEmpleado = defineAction({
  schema: cambiarEstadoSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const objetivo = await cargarObjetivo(db, input.membershipId);
    const veredicto = puedeCambiarEstado(
      { userId: ctx.user.id, role: ctx.role },
      objetivo,
      input.active,
      await contarPropietarios(db),
    );
    if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);

    await db.membership.update({ where: { id: objetivo.id }, data: { active: input.active } });

    // Dar de baja y dejarle la sesión abierta no es dar de baja. El DAL ya lo
    // frenaría en el próximo request, pero cerrarle la sesión es lo honesto.
    if (!input.active) await revokeAllSessions(objetivo.userId);

    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: input.active ? "equipo.reactivar" : "equipo.dar-de-baja",
        entity: "Membership",
        entityId: objetivo.id,
        metadata: { persona: objetivo.user.email },
      },
    });

    revalidatePath("/administracion/equipo");
  },
});

export const restablecerContrasena = defineAction({
  schema: restablecerContrasenaSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const objetivo = await cargarObjetivo(db, input.membershipId);

    // `User.passwordHash` no es de este negocio: es de la persona. Si además
    // trabaja en otro lado, cambiársela desde acá no le cambia "su clave de este
    // bar" —no existe tal cosa—, le cambia la única que tiene, y se la entrega a
    // quien la escribió.
    //
    // Esa era la segunda mitad de una cadena concreta: agregar al dueño de otro
    // negocio como mesero (lo que ahora frena `puedeVincularCuentaExistente`) y
    // resetearle la contraseña para entrar a SU negocio. Hacen falta las dos
    // guardas: la primera no alcanza porque un empleado de un negocio ajeno sí
    // se puede enganchar, y con razón.
    //
    // "Fuera" es fuera de LA CUENTA, no fuera de esta sede. Con `{ not:
    // ctx.business.id }` a secas, el empleado que trabaja en las dos sucursales
    // del mismo dueño contaba como de afuera y su propio patrón no podía
    // cambiarle la clave: justo el caso que esto tiene que dejar fluido. Las
    // otras sedes son suyas, así que la contraseña no abre ninguna puerta ajena.
    const sedesPropias = await sedesDeLaMismaCuenta(rootDb, ctx.business.id);
    const cuentasFuera = await rootDb.membership.count({
      where: {
        userId: objetivo.userId,
        businessId: { notIn: sedesPropias },
        active: true,
        business: { deletedAt: null },
      },
    });

    const veredicto = puedeRestablecerContrasenaGlobal(
      { userId: ctx.user.id, role: ctx.role },
      objetivo,
      cuentasFuera > 0,
    );
    if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);

    await rootDb.user.update({
      where: { id: objetivo.userId },
      data: {
        passwordHash: await hashPassword(input.password),
        // Se le limpia el bloqueo por intentos fallidos: es la vía por la que
        // alguien vuelve a entrar después de olvidarla.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Si el motivo para cambiarla fue que alguien más la sabía, dejar las
    // sesiones abiertas no arregla nada.
    await revokeAllSessions(objetivo.userId);

    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "equipo.contrasena.restablecer",
        entity: "Membership",
        entityId: objetivo.id,
        metadata: { persona: objetivo.user.email },
      },
    });

    revalidatePath("/administracion/equipo");
  },
});

/**
 * Mandarle a alguien un enlace para que elija su propia contraseña.
 *
 * Es la salida para quien trabaja además en otro negocio, a quien
 * `restablecerContrasenaGlobal` no deja tocarle la clave: como su contraseña
 * abre puertas que no son de acá, la única forma honesta de ayudarlo es que la
 * elija él y que nadie más la conozca.
 *
 * También sirve para el caso de siempre —alguien que se la olvidó y prefiere
 * elegirla solo—, así que se ofrece para todo el equipo y no únicamente para el
 * caso bloqueado.
 *
 * El enlace va al correo de la persona y no se muestra en pantalla: si se
 * mostrara, quien lo mira podría abrirlo y ponerle la contraseña él, que es
 * exactamente lo que esto viene a evitar.
 */
export const mandarEnlaceDeContrasena = defineAction({
  schema: mandarEnlaceSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const objetivo = await cargarObjetivo(db, input.membershipId);

    // Sin este chequeo, un administrador le manda un enlace de recuperación al
    // propietario, le llega al correo del dueño y —si tiene acceso a ese buzón—
    // se queda con el negocio. Es la misma frontera que cuida
    // `puedeRestablecerContrasena`, así que se aplica igual.
    if (
      objetivo.role === Role.PROPIETARIO &&
      ctx.role !== Role.PROPIETARIO &&
      objetivo.userId !== ctx.user.id
    ) {
      throw new ErrorDeUsuario(
        "Solo un propietario puede mandarle el enlace de contraseña a otro propietario.",
      );
    }

    const token = await emitirToken(objetivo.userId, "PASSWORD_RESET");
    const correo = correoDeRecuperacion({
      urlDeRestablecer: `${env.APP_URL}/restablecer-contrasena?token=${token}`,
    });

    // Va por `enviarCorreo` y no por `enviarCorreoSinBloquear`, que es la regla
    // de la casa para los avisos: acá el correo ES la operación. Un "listo" sobre
    // un correo que nunca salió deja a alguien esperando un enlace que no existe
    // —el mismo motivo por el que el formulario de contacto también lo evita—.
    // Igual no lanza: devuelve si salió, y el motivo técnico queda en el log.
    const envio = await enviarCorreo({
      para: objetivo.user.email,
      asunto: correo.asunto,
      html: correo.html,
      texto: correo.texto,
    });

    if (!envio.enviado) {
      console.error(`[equipo] no se pudo mandar el enlace: ${envio.motivo}`);
      throw new ErrorDeUsuario(
        "No pudimos mandar el correo en este momento. Probá de nuevo en un rato.",
      );
    }

    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "equipo.contrasena.enlace",
        entity: "Membership",
        entityId: objetivo.id,
        metadata: { persona: objetivo.user.email },
      },
    });

    revalidatePath("/administracion/equipo");
    return { correo: objetivo.user.email };
  },
});
