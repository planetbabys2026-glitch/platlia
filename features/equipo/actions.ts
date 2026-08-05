"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import {
  agregarEmpleadoSchema,
  cambiarEstadoSchema,
  cambiarRolSchema,
  restablecerContrasenaSchema,
} from "@/features/equipo/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { hashPassword } from "@/lib/auth/password";
import {
  puedeAsignarRol,
  puedeCambiarEstado,
  puedeCambiarRol,
  puedeRestablecerContrasena,
} from "@/lib/auth/reglas-equipo";
import { revokeAllSessions } from "@/lib/auth/session";
import { enviarCorreoSinBloquear } from "@/lib/email/enviar";
import { correoDeBienvenida } from "@/lib/email/plantillas";
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

    // El aviso va después de crear la membresía y no bloquea: que Resend esté
    // caído no puede impedir que el empleado quede dado de alta. Nunca lleva la
    // contraseña —la entrega el dueño en persona—, porque mandarla por correo la
    // deja escrita para siempre en un buzón que no controlamos.
    const bienvenida = correoDeBienvenida({
      nombre: input.name,
      negocio: ctx.business.name,
      rol: input.role,
      urlDeIngreso: `${env.APP_URL}/ingresar`,
    });
    await enviarCorreoSinBloquear({
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
    const veredicto = puedeRestablecerContrasena(
      { userId: ctx.user.id, role: ctx.role },
      objetivo,
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
