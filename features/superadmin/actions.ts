"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  actualizarLimiteSucursalesSchema,
  agregarSuperAdminSchema,
  bootstrapSchema,
  editarSuperAdminSchema,
  extenderSchema,
  gestionFacturacionElectronicaSchema,
  ingresoSchema,
  quitarSuperAdminSchema,
  restablecerContrasenaSuperAdminSchema,
  suspenderSchema,
} from "@/features/superadmin/schemas";
import { definePublicAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { hashPassword, hashSenuelo, verifyPassword } from "@/lib/auth/password";
import { getSuperAdmin } from "@/lib/auth/dal";
import { puedeQuitarSuperAdmin } from "@/lib/auth/reglas-superadmin";
import { createSession, destroySession, revokeAllSessions } from "@/lib/auth/session";
import { enviarCorreoSinBloquear } from "@/lib/email/enviar";
import { correoDeAltaSuperAdmin } from "@/lib/email/plantillas";
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

    const sub = await rootDb.subscription.findUnique({
      where: { businessId: input.businessId },
    });

    if (sub) {
      const nuevoEstadoSub = input.suspender
        ? "SUSPENDIDA"
        : estadoSegunFechas(sub, new Date());

      await rootDb.subscription.update({
        where: { id: sub.id },
        data: { status: nuevoEstadoSub },
      });
    }

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
    // Se extiende desde la fecha de fin vigente o desde hoy
    const finVigente = sub.currentPeriodEnd ?? sub.trialEndsAt;
    const base = finVigente && finVigente > new Date() ? finVigente : new Date();
    const nuevoFin = new Date(base.getTime() + input.dias * DIA);

    const actualizacionData = {
      currentPeriodEnd: nuevoFin,
      trialEndsAt: sub.status === "PRUEBA" ? nuevoFin : sub.trialEndsAt,
      graceUntil: sub.status === "PRUEBA" ? nuevoFin : new Date(nuevoFin.getTime() + 3 * DIA),
    };

    await rootDb.subscription.update({
      where: { id: sub.id },
      data: {
        ...actualizacionData,
        status: estadoSegunFechas(
          { ...sub, ...actualizacionData },
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

/**
 * Suma a alguien al equipo de superadministración.
 *
 * Si el correo ya tiene cuenta —porque esa persona también trabaja en un
 * negocio como cliente— se le prende la marca sin tocarle la contraseña: es
 * suya. Igual que `agregarEmpleado` con el equipo de un negocio.
 */
export const agregarSuperAdmin = definePublicAction({
  schema: agregarSuperAdminSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const existente = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true, isSuperAdmin: true },
    });

    if (existente?.isSuperAdmin) {
      throw new ErrorDeUsuario(`${input.email} ya es superadministrador.`);
    }

    let userId: string;
    const reutilizado = Boolean(existente);

    if (existente) {
      await rootDb.user.update({
        where: { id: existente.id },
        data: { isSuperAdmin: true, emailVerifiedAt: new Date() },
      });
      userId = existente.id;
    } else {
      const creado = await rootDb.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          isSuperAdmin: true,
          // Lo agrega otro superadministrador en persona: no hay correo que verificar.
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });
      userId = creado.id;
    }

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.equipo.agregar",
        entity: "User",
        entityId: userId,
        metadata: { email: input.email, reutilizado },
      },
    });

    // No bloquea: que Resend esté caído no puede impedir que la cuenta quede
    // creada. Nunca lleva la contraseña —la entrega quien lo agregó, en persona.
    const bienvenida = correoDeAltaSuperAdmin({
      nombre: input.name,
      urlDeIngreso: `${env.APP_URL}/superadmin/ingresar`,
    });
    await enviarCorreoSinBloquear({
      para: input.email,
      asunto: bienvenida.asunto,
      html: bienvenida.html,
      texto: bienvenida.texto,
      contexto: `alta de superadministrador para ${input.email}`,
    });

    revalidatePath("/superadmin/equipo");
    return { reutilizado };
  },
});

/** Carga un superadministrador por id, o null si no existe o ya no lo es. */
async function cargarSuperAdmin(userId: string) {
  return rootDb.user.findFirst({
    where: { id: userId, isSuperAdmin: true },
    select: { id: true, email: true },
  });
}

export const editarSuperAdmin = definePublicAction({
  schema: editarSuperAdminSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const objetivo = await cargarSuperAdmin(input.userId);
    if (!objetivo) throw new ErrorDeUsuario("Ese superadministrador no existe.");

    if (input.email !== objetivo.email) {
      const enUso = await rootDb.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (enUso) throw new ErrorDeUsuario("Ese correo ya lo usa otra cuenta.");
    }

    await rootDb.user.update({
      where: { id: objetivo.id },
      data: {
        name: input.name,
        email: input.email,
        // Lo cambia otro superadministrador en persona: vale como verificación,
        // igual que cuando se lo agrega por primera vez.
        emailVerifiedAt: new Date(),
      },
    });

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.equipo.editar",
        entity: "User",
        entityId: objetivo.id,
        metadata: { de: objetivo.email, a: input.email },
      },
    });

    revalidatePath("/superadmin/equipo");
  },
});

export const restablecerContrasenaSuperAdmin = definePublicAction({
  schema: restablecerContrasenaSuperAdminSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const objetivo = await cargarSuperAdmin(input.userId);
    if (!objetivo) throw new ErrorDeUsuario("Ese superadministrador no existe.");

    await rootDb.user.update({
      where: { id: objetivo.id },
      data: {
        passwordHash: await hashPassword(input.password),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Sin filtrar por tipo: la contraseña cambió, así que TODA sesión de esa
    // persona muere, incluida cualquiera que tenga como cliente de un negocio.
    await revokeAllSessions(objetivo.id);

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.equipo.contrasena.restablecer",
        entity: "User",
        entityId: objetivo.id,
        metadata: { email: objetivo.email },
      },
    });

    revalidatePath("/superadmin/equipo");
  },
});

/**
 * Le quita a alguien el acceso de superadministrador.
 *
 * No borra la cuenta: solo apaga la marca. Si esa persona además es cliente de
 * algún negocio, esa parte de su cuenta sigue intacta.
 */
export const quitarSuperAdmin = definePublicAction({
  schema: quitarSuperAdminSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const objetivo = await cargarSuperAdmin(input.userId);
    if (!objetivo) throw new ErrorDeUsuario("Ese superadministrador no existe.");

    const activos = await rootDb.user.count({ where: { isSuperAdmin: true } });
    const veredicto = puedeQuitarSuperAdmin(
      { userId: superAdmin.id },
      { userId: objetivo.id },
      activos,
    );
    if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);

    await rootDb.user.update({ where: { id: objetivo.id }, data: { isSuperAdmin: false } });

    // Solo la puerta de superadministración: si esa persona también entra como
    // cliente de un negocio, esa sesión no tiene nada que ver con esto.
    await revokeAllSessions(objetivo.id, "SUPERADMIN");

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.equipo.quitar",
        entity: "User",
        entityId: objetivo.id,
        metadata: { email: objetivo.email },
      },
    });

    revalidatePath("/superadmin/equipo");
  },
});

export const actualizarLimiteSucursales = definePublicAction({
  schema: actualizarLimiteSucursalesSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const sub = await rootDb.subscription.findUnique({
      where: { businessId: input.businessId },
    });
    if (!sub) throw new ErrorDeUsuario("Esa empresa no tiene suscripción.");

    await rootDb.subscription.update({
      where: { id: sub.id },
      data: { maxBranches: input.maxBranches },
    });

    await rootDb.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: superAdmin.id,
        action: "superadmin.sucursales.limite",
        entity: "Subscription",
        entityId: sub.id,
        metadata: { maxBranches: input.maxBranches, motivo: input.motivo },
      },
    });

    revalidatePath("/superadmin");
  },
});

export const gestionarPaqueteFacturacionElectronica = definePublicAction({
  schema: gestionFacturacionElectronicaSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const settings = await rootDb.businessSettings.findUnique({
      where: { businessId: input.businessId },
    });

    if (!settings) throw new ErrorDeUsuario("Esa empresa no tiene configuración registrada.");

    const nuevosDisponibles = (settings.paquetesDocumentosDisponibles ?? 0) + input.sumarDocumentos;

    await rootDb.businessSettings.update({
      where: { businessId: input.businessId },
      data: {
        facturacionElectronicaHabilitada: input.habilitar,
        paquetesDocumentosDisponibles: nuevosDisponibles,
      },
    });

    await rootDb.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: superAdmin.id,
        action: "superadmin.facturacion_electronica.paquete",
        entity: "BusinessSettings",
        entityId: settings.id,
        metadata: {
          habilitado: input.habilitar,
          documentosSumados: input.sumarDocumentos,
          totalDisponible: nuevosDisponibles,
          motivo: input.motivo,
        },
      },
    });

    revalidatePath("/superadmin");
  },
});
