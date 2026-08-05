"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  bootstrapSchema,
  extenderSchema,
  ingresoSchema,
  suspenderSchema,
} from "@/features/superadmin/schemas";
import { definePublicAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { hashPassword, hashSenuelo, verifyPassword } from "@/lib/auth/password";
import { getSuperAdmin } from "@/lib/auth/dal";
import { createSession, destroySession } from "@/lib/auth/session";
// Superadministración: por definición mira y toca todas las empresas, así que no
// hay businessId con el cual acotar. Es una de las tres excepciones previstas.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { env } from "@/lib/env";
import { estadoSegunFechas } from "@/lib/billing/suscripcion";

/** Comparación en tiempo constante: el token no se adivina midiendo respuestas. */
function tokenValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Crea el superadministrador maestro. Se usa una sola vez, en el primer
 * despliegue, y después se borra `SUPERADMIN_BOOTSTRAP_TOKEN` del entorno.
 *
 * Tres cerrojos: sin la variable la página responde 404 —indistinguible de una
 * ruta inexistente—, el token se compara en tiempo constante, y si ya existe un
 * superadministrador la ruta se cierra sola aunque la variable siga puesta.
 */
export const crearSuperAdmin = definePublicAction({
  schema: bootstrapSchema,
  async handler({ input }) {
    const esperado = env.SUPERADMIN_BOOTSTRAP_TOKEN;
    if (!esperado) throw new ErrorDeUsuario("El bootstrap está cerrado.");

    if (!tokenValido(input.token, esperado)) {
      throw new ErrorDeUsuario("Token incorrecto.");
    }

    const yaHay = await rootDb.user.count({ where: { isSuperAdmin: true } });
    if (yaHay > 0) {
      throw new ErrorDeUsuario(
        "Ya existe un superadministrador. Esta ruta no crea el segundo: borrá SUPERADMIN_BOOTSTRAP_TOKEN del entorno.",
      );
    }

    const existente = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existente) {
      await rootDb.user.update({
        where: { id: existente.id },
        data: { isSuperAdmin: true, passwordHash: await hashPassword(input.password) },
      });
    } else {
      await rootDb.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          isSuperAdmin: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    await rootDb.auditLog.create({
      data: {
        action: "superadmin.bootstrap",
        entity: "User",
        metadata: { email: input.email },
      },
    });

    redirect("/superadmin/ingresar");
  },
});

/** Ingreso a superadministración. Cookie propia, sesión propia. */
export const ingresarSuperAdmin = definePublicAction({
  schema: ingresoSchema,
  async handler({ input }) {
    const user = await rootDb.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        isSuperAdmin: true,
        status: true,
        deletedAt: true,
      },
    });

    // Se verifica siempre, exista o no el usuario: es lo que iguala el tiempo.
    const coincide = await verifyPassword(
      user?.passwordHash ?? (await hashSenuelo()),
      input.password,
    );

    // Un mismo mensaje para todo: que alguien sea o no superadministrador no se
    // averigua desde este formulario.
    if (!user || !coincide || !user.isSuperAdmin || user.status !== "ACTIVO" || user.deletedAt) {
      throw new ErrorDeUsuario("Credenciales incorrectas.");
    }

    await createSession({ userId: user.id, kind: "SUPERADMIN" });
    redirect("/superadmin");
  },
});

export async function salirSuperAdmin() {
  await destroySession("SUPERADMIN");
  redirect("/superadmin/ingresar");
}

/** Acciones de soporte sobre una empresa. Todas quedan en la bitácora. */
export const suspenderEmpresa = definePublicAction({
  schema: suspenderSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    await rootDb.business.update({
      where: { id: input.businessId },
      data: { status: input.suspender ? "SUSPENDIDO" : "ACTIVO" },
    });

    await rootDb.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: superAdmin.id,
        action: input.suspender ? "superadmin.empresa.suspender" : "superadmin.empresa.reactivar",
        entity: "Business",
        entityId: input.businessId,
        metadata: { motivo: input.motivo },
      },
    });

    revalidatePath("/superadmin");
  },
});

/**
 * Regala días de licencia. Es la herramienta de soporte para cuando un cobro
 * falló por causas nuestras y el negocio no puede quedarse sin trabajar.
 */
export const extenderLicencia = definePublicAction({
  schema: extenderSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const sub = await rootDb.subscription.findUnique({
      where: { businessId: input.businessId },
      select: {
        id: true,
        status: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        graceUntil: true,
      },
    });
    if (!sub) throw new ErrorDeUsuario("Esa empresa no tiene suscripción.");

    const DIA = 86_400_000;
    // Se extiende desde hoy o desde el vencimiento, lo que sea mayor: regalar
    // días no puede acortar un período que todavía corre.
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()
      ? sub.currentPeriodEnd
      : new Date();
    const nuevoFin = new Date(base.getTime() + input.dias * DIA);

    await rootDb.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodEnd: nuevoFin,
        graceUntil: new Date(nuevoFin.getTime() + 3 * DIA),
        status: estadoSegunFechas(
          { ...sub, currentPeriodEnd: nuevoFin, graceUntil: new Date(nuevoFin.getTime() + 3 * DIA) },
          new Date(),
        ),
      },
    });

    await rootDb.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: superAdmin.id,
        action: "superadmin.licencia.extender",
        entity: "Subscription",
        entityId: sub.id,
        metadata: { dias: input.dias, motivo: input.motivo, hasta: nuevoFin.toISOString() },
      },
    });

    revalidatePath("/superadmin");
  },
});
