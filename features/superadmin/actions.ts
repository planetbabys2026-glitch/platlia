"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  actualizarLimiteSucursalesSchema,
  agregarSuperAdminSchema,
  bootstrapSchema,
  editarSuperAdminSchema,
  guardarListaBaseSchema,
  guardarPromocionSchema,
  sobrePromocionSchema,
  extenderSchema,
  gestionFacturacionElectronicaSchema,
  registrarCompraDocumentosSchema,
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
import { DIAS_DE_GRACIA, estadoSegunFechas } from "@/lib/billing/suscripcion";
import {
  principalDeLaCuenta,
  sedesDeLaMismaCuenta,
  sincronizarSedes,
} from "@/lib/billing/cuenta";
import { listarRangosDeNumeracion, obtenerTokenFactus } from "@/lib/billing/factus";
import {
  configFactusDePlataforma,
  plataformaFacturaConfigurada,
} from "@/lib/billing/factus-plataforma";
import { getBolsaDocumentosDian } from "@/features/superadmin/queries";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

/** Comparación en tiempo constante: el token no se adivina midiendo respuestas. */
function tokenValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Rehace el superadministrador maestro desde cero: borra los que haya y deja
 * uno solo, el que se acaba de escribir.
 *
 * Es una puerta de recuperación, no un alta de gente. Para sumar a alguien al
 * equipo de soporte está `/superadmin/equipo`, que exige estar adentro; esto es
 * para cuando **nadie** puede entrar y hay que volver a empezar.
 *
 * Lo único que la abre es `SUPERADMIN_BOOTSTRAP_TOKEN`. Sin esa variable la
 * página responde 404 —indistinguible de una ruta inexistente, así que ni
 * siquiera confirma que Platlia tenga una puerta de recuperación— y el token se
 * compara en tiempo constante.
 *
 * **Mientras la variable esté en el entorno, la puerta está abierta.** Antes se
 * cerraba sola al existir el primer superadministrador, que era una red de
 * contención para el olvido de borrarla; ahora esa red no está y el token es una
 * llave permanente. Quien lo lea del entorno entra. Sacarlo después de usarlo
 * dejó de ser una recomendación y es parte del procedimiento.
 */
export const crearSuperAdmin = definePublicAction({
  schema: bootstrapSchema,
  async handler({ input }) {
    const esperado = env.SUPERADMIN_BOOTSTRAP_TOKEN;
    if (!esperado) throw new ErrorDeUsuario("El bootstrap está cerrado.");

    if (!tokenValido(input.token, esperado)) {
      // Queda anotado: es la única señal de que alguien está probando la puerta.
      await rootDb.auditLog.create({
        data: {
          action: "superadmin.bootstrap.token-invalido",
          entity: "User",
          metadata: { email: input.email },
        },
      });
      throw new ErrorDeUsuario("Token incorrecto.");
    }

    const anteriores = await rootDb.user.findMany({
      where: { isSuperAdmin: true, email: { not: input.email } },
      select: { id: true, email: true, _count: { select: { memberships: true } } },
    });

    // "Borrar los que hay" con el único matiz que importa: a quien además
    // trabaja en un negocio se le quita la marca y se le matan las sesiones de
    // soporte, pero no se le borra la cuenta. Borrarla se llevaría por cascada
    // sus membresías y dejaría a un negocio sin su dueño por recuperar un acceso
    // que no tiene nada que ver. A las cuentas que solo existían para dar
    // soporte no les queda nada que conservar y se borran de verdad.
    const borrados: string[] = [];
    const degradados: string[] = [];

    for (const anterior of anteriores) {
      await revokeAllSessions(anterior.id, "SUPERADMIN");

      if (anterior._count.memberships === 0) {
        await rootDb.user.delete({ where: { id: anterior.id } });
        borrados.push(anterior.email);
      } else {
        await rootDb.user.update({
          where: { id: anterior.id },
          data: { isSuperAdmin: false },
        });
        degradados.push(anterior.email);
      }
    }

    const existente = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existente) {
      // Reusar el correo es el caso normal de recuperación: se cambia la clave,
      // así que toda sesión suya —de soporte y del producto— tiene que morir.
      await rootDb.user.update({
        where: { id: existente.id },
        data: {
          name: input.name,
          isSuperAdmin: true,
          passwordHash: await hashPassword(input.password),
        },
      });
      await revokeAllSessions(existente.id);
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
        metadata: {
          email: input.email,
          reemplazo: existente ? "correo existente" : "cuenta nueva",
          borrados,
          degradados,
        },
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

/**
 * Acciones de soporte sobre una cuenta. Todas quedan en la bitácora.
 *
 * Suspender alcanza a TODAS las sedes del dueño, no solo a la que se tocó. La
 * licencia es de la cuenta: bloquear un local y dejar el otro trabajando no es
 * una suspensión, es un negocio a medio bloquear con una licencia que dice dos
 * cosas distintas según por dónde entre.
 */
export const suspenderEmpresa = definePublicAction({
  schema: suspenderSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const ahora = new Date();

    const sedes = await rootDb.$transaction(async (tx) => {
      const businessIds = await sedesDeLaMismaCuenta(tx, input.businessId);

      await tx.business.updateMany({
        where: { id: { in: businessIds } },
        data: { status: input.suspender ? "SUSPENDIDO" : "ACTIVO" },
      });

      const subs = await tx.subscription.findMany({
        where: { businessId: { in: businessIds } },
      });

      // Una por una y no con `updateMany`: al reactivar, cada sede vuelve al
      // estado que le corresponde por sus propias fechas.
      for (const sub of subs) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: input.suspender ? "SUSPENDIDA" : estadoSegunFechas(sub, ahora) },
        });
      }

      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          userId: superAdmin.id,
          action: input.suspender
            ? "superadmin.empresa.suspender"
            : "superadmin.empresa.reactivar",
          entity: "Business",
          entityId: input.businessId,
          metadata: { motivo: input.motivo, sedes: businessIds.length },
        },
      });

      return businessIds.length;
    });

    revalidatePath("/superadmin");
    return { sedes };
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

    const DIA = 86_400_000;
    const ahora = new Date();

    const resultado = await rootDb.$transaction(async (tx) => {
      // La cuenta manda: se extiende la suscripción de la sede principal y las
      // demás se sincronizan. Extender una sola dejaba al resto vencido con los
      // días ya regalados encima, y nadie se enteraba hasta que el cliente
      // volvía a llamar.
      const { principalBusinessId, businessIds } = await principalDeLaCuenta(
        tx,
        input.businessId,
      );

      const sub = await tx.subscription.findUnique({
        where: { businessId: principalBusinessId },
        select: {
          id: true,
          status: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          graceUntil: true,
          business: { select: { status: true } },
        },
      });
      if (!sub) throw new ErrorDeUsuario("Esa empresa no tiene suscripción.");

      // Se extiende desde la fecha de fin vigente o desde hoy
      const finVigente = sub.currentPeriodEnd ?? sub.trialEndsAt;
      const base = finVigente && finVigente > ahora ? finVigente : ahora;
      const nuevoFin = new Date(base.getTime() + input.dias * DIA);

      const actualizacionData = {
        currentPeriodEnd: nuevoFin,
        trialEndsAt: sub.status === "PRUEBA" ? nuevoFin : sub.trialEndsAt,
        graceUntil:
          sub.status === "PRUEBA"
            ? nuevoFin
            : new Date(nuevoFin.getTime() + DIAS_DE_GRACIA * DIA),
      };

      /**
       * Extender tiene que DESTRABAR, no solo mover una fecha.
       *
       * `estadoSegunFechas` deja `SUSPENDIDA` congelada sin mirar el reloj —a
       * propósito: una suspensión de soporte es una decisión, no un accidente de
       * cobro—. Pero el cron marca `SUSPENDIDA` a todo lo que pasó la gracia, así
       * que al extender una licencia vencida el estado no se movía y el negocio
       * seguía bloqueado con treinta días regalados encima. Nadie se enteraba
       * hasta que el cliente volvía a llamar.
       *
       * La diferencia entre las dos suspensiones está en `Business.status`: la
       * que decidió soporte lo pone en SUSPENDIDO. Esa no revive acá; se reactiva
       * desde la pestaña Estado, que es donde se tomó la decisión.
       */
      const suspendidaPorSoporte = sub.business?.status !== "ACTIVO";
      /**
       * Activar a mano gana sobre el cálculo por fechas.
       *
       * `estadoSegunFechas` mira el reloj y devolvería PRUEBA otra vez —la
       * cuenta sigue teniendo `trialEndsAt`—, así que sin este caso especial la
       * conversión no se pegaba. Cuando soporte activa, el período pasa a ser un
       * período pago de verdad: se le da gracia como a cualquier licencia y se
       * apaga el `trialEndsAt`, porque una cuenta activa que conserva fecha de
       * prueba vuelve a caer en PRUEBA en el próximo recálculo.
       */
      if (input.activar) {
        actualizacionData.trialEndsAt = null;
        actualizacionData.graceUntil = new Date(nuevoFin.getTime() + DIAS_DE_GRACIA * DIA);
      }

      const estadoNuevo = input.activar
        ? "ACTIVA"
        : sub.status === "SUSPENDIDA" && !suspendidaPorSoporte && nuevoFin > ahora
          ? "ACTIVA"
          : estadoSegunFechas({ ...sub, ...actualizacionData }, ahora);

      await tx.subscription.update({
        where: { id: sub.id },
        data: { ...actualizacionData, status: estadoNuevo },
      });

      // Lo que le regalamos a la cuenta lo reciben todas sus sedes.
      await sincronizarSedes(tx, {
        businessIds,
        exceptoBusinessId: principalBusinessId,
        status: estadoNuevo,
        currentPeriodStart: sub.currentPeriodStart ?? ahora,
        currentPeriodEnd: nuevoFin,
        graceUntil: actualizacionData.graceUntil,
        trialEndsAt: actualizacionData.trialEndsAt,
      });

      await tx.auditLog.create({
        data: {
          businessId: principalBusinessId,
          userId: superAdmin.id,
          action: "superadmin.licencia.extender",
          entity: "Subscription",
          entityId: sub.id,
          metadata: {
            dias: input.dias,
            activadaAMano: input.activar,
            motivo: input.motivo,
            hasta: nuevoFin.toISOString(),
            estadoAnterior: sub.status,
            estadoNuevo,
            sedes: businessIds.length,
          },
        },
      });

      return { sedes: businessIds.length, hasta: nuevoFin };
    });

    revalidatePath("/superadmin");
    return resultado;
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

/**
 * Asignar facturación electrónica a un negocio.
 *
 * Acá se decide todo lo fiscal del cliente: si el módulo está prendido, cuántos
 * documentos de NUESTRA bolsa le tocan, y con qué rango de numeración de la DIAN
 * factura. El dueño ya no edita nada de esto —su pestaña es de solo lectura—
 * porque un rango mal escrito es una factura rechazada que se descubre con el
 * cliente esperando en la caja.
 */
export const gestionarPaqueteFacturacionElectronica = definePublicAction({
  schema: gestionFacturacionElectronicaSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const settings = await rootDb.businessSettings.findUnique({
      where: { businessId: input.businessId },
    });

    if (!settings) throw new ErrorDeUsuario("Esa empresa no tiene configuración registrada.");

    if (input.sumarDocumentos > 0) {
      // Sin esta cuenta la bolsa se repartía a ciegas y se agotaba en medio del
      // servicio de un cliente que creía tener documentos.
      const { sinAsignar } = await getBolsaDocumentosDian();
      if (input.sumarDocumentos > sinAsignar) {
        throw new ErrorDeUsuario(
          `Solo quedan ${sinAsignar} documentos sin asignar en la bolsa. Registrá una compra antes de repartir más.`,
        );
      }
    }

    const nuevosDisponibles = (settings.paquetesDocumentosDisponibles ?? 0) + input.sumarDocumentos;

    await rootDb.businessSettings.update({
      where: { businessId: input.businessId },
      data: {
        facturacionElectronicaHabilitada: input.habilitar,
        paquetesDocumentosDisponibles: nuevosDisponibles,
        factusNumberingRangeId: input.numberingRangeId,
        factusNumberingRangeIdNc: input.numberingRangeIdNc,
        municipalityCode: input.municipalityCode ?? settings.municipalityCode,
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
          numberingRangeId: input.numberingRangeId,
          numberingRangeIdNc: input.numberingRangeIdNc,
          municipalityCode: input.municipalityCode,
          motivo: input.motivo,
        },
      },
    });

    revalidatePath("/superadmin");
    revalidatePath("/superadmin/facturacion");
  },
});

/**
 * Registrar una compra de documentos electrónicos a Factus.
 *
 * Es lo que le da fondo a la bolsa: hasta acá el superadministrador sumaba
 * documentos por negocio sin que hubiera escrito en ningún lado cuántos habíamos
 * comprado, así que no había forma de saber cuántos quedaban.
 */
export const registrarCompraDocumentos = definePublicAction({
  schema: registrarCompraDocumentosSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const compra = await rootDb.compraDocumentosDian.create({
      data: { cantidad: input.cantidad, costoCop: input.costoCop, nota: input.nota },
    });

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.facturacion_electronica.compra",
        entity: "CompraDocumentosDian",
        entityId: compra.id,
        metadata: { cantidad: input.cantidad, costoCop: input.costoCop, nota: input.nota },
      },
    });

    revalidatePath("/superadmin/facturacion");
    return { id: compra.id };
  },
});

/**
 * Los rangos de numeración de la cuenta de Factus de la plataforma.
 *
 * Se consultan para poder ELEGIR el rango de una lista en vez de escribir un id
 * de memoria. También sirve de prueba de conexión: si esto responde, las
 * credenciales están bien.
 */
export const consultarRangosDeNumeracion = definePublicAction({
  schema: z.object({}),
  async handler() {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    if (!plataformaFacturaConfigurada()) {
      throw new ErrorDeUsuario(
        "La cuenta de Factus de la plataforma no está configurada: faltan las variables FACTUS_* del entorno.",
      );
    }

    const config = configFactusDePlataforma();
    try {
      const { access_token } = await obtenerTokenFactus(config);
      const rangos = await listarRangosDeNumeracion(access_token, config.baseUrl);
      return { rangos };
    } catch (error) {
      const detalle = error instanceof Error ? error.message.slice(0, 300) : "sin detalle";
      throw new ErrorDeUsuario(`Factus rechazó la conexión. ${detalle}`);
    }
  },
});

// ─── Precios de la plataforma ────────────────────────────────────────────────

/**
 * El precio de lista de Platlia.
 *
 * Es lo único que faltaba para poder hacer una promoción sin tocar código: hasta
 * acá el precio estaba escrito a mano en seis archivos y cambiarle la tarifa a un
 * cliente se hacía con SQL.
 */
export const guardarListaBase = definePublicAction({
  schema: guardarListaBaseSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const base = await rootDb.listaDePrecios.findFirst({
      where: { desde: null, hasta: null },
      orderBy: { createdAt: "asc" },
    });

    const datos = {
      precioSedePrincipalCop: input.precioSedePrincipalCop,
      precioSedeAdicionalCop: input.precioSedeAdicionalCop,
      mesesGratisSemestral: input.mesesGratisSemestral,
      mesesGratisAnual: input.mesesGratisAnual,
    };

    const guardada = await rootDb.$transaction(async (tx) => {
      const lista = base
        ? await tx.listaDePrecios.update({ where: { id: base.id }, data: datos })
        : await tx.listaDePrecios.create({
            data: { ...datos, nombre: "Lista base", activa: true },
          });

      await reemplazarTramos(tx, lista.id, input.tramos);
      return lista;
    });

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.precios.lista-base",
        entity: "ListaDePrecios",
        entityId: guardada.id,
        metadata: {
          motivo: input.motivo,
          antes: base
            ? {
                principal: base.precioSedePrincipalCop,
                adicional: base.precioSedeAdicionalCop,
                gratis6: base.mesesGratisSemestral,
                gratis12: base.mesesGratisAnual,
              }
            : null,
          ahora: { ...datos, tramos: input.tramos },
        },
      },
    });

    revalidatePath("/superadmin/precios");
    // La portada y las pantallas de cobro leen la misma lista.
    revalidatePath("/");
    revalidatePath("/facturacion");
  },
});

/**
 * Corta una promoción antes de su fecha de fin.
 *
 * Existe como acción propia y no como "guardar con la casilla apagada" porque son
 * dos intenciones distintas: una promoción se detiene cuando hay que detenerla
 * —salió mal, se agotó el cupo, alguien se equivocó de precio— y en ese momento
 * nadie quiere revisar un formulario entero de precios y fechas. Además queda en
 * la bitácora con su propio nombre, así que después se puede leer qué pasó.
 *
 * Se apaga, no se borra: la promoción ya cobró y ese historial tiene que existir.
 */
export const detenerPromocion = definePublicAction({
  schema: sobrePromocionSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const promo = await rootDb.listaDePrecios.findUnique({ where: { id: input.id } });
    if (!promo) throw new ErrorDeUsuario("Esa promoción ya no existe.");

    // La lista base no es una promoción y apagarla dejaría a la plataforma sin
    // ningún precio: se cotizaría con `LISTA_POR_DEFECTO` sin que nadie lo pida.
    if (!promo.desde && !promo.hasta) {
      throw new ErrorDeUsuario("Esa es la lista base, no una promoción: no se puede apagar.");
    }

    await rootDb.listaDePrecios.update({
      where: { id: input.id },
      data: { activa: false },
    });

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.precios.promo.detener",
        entity: "ListaDePrecios",
        entityId: promo.id,
        metadata: {
          motivo: input.motivo,
          nombre: promo.nombre,
          terminabaEl: promo.hasta?.toISOString() ?? null,
        },
      },
    });

    revalidatePath("/superadmin/precios");
    revalidatePath("/");
    revalidatePath("/facturacion");
    revalidatePath("/administracion/configuracion");
  },
});

/**
 * Borra una promoción de verdad.
 *
 * Solo para la que se creó mal y nunca cobró nada. Una que ya rigió se apaga con
 * `detenerPromocion`: borrarla dejaría pagos cuyo precio no se puede explicar.
 */
export const eliminarPromocion = definePublicAction({
  schema: sobrePromocionSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    const promo = await rootDb.listaDePrecios.findUnique({ where: { id: input.id } });
    if (!promo) throw new ErrorDeUsuario("Esa promoción ya no existe.");

    if (!promo.desde && !promo.hasta) {
      throw new ErrorDeUsuario("Esa es la lista base, no una promoción: no se puede borrar.");
    }

    if (promo.desde && promo.desde <= new Date()) {
      throw new ErrorDeUsuario(
        "Esta promoción ya empezó: apagala en vez de borrarla, así queda con qué explicar lo que cobró.",
      );
    }

    await rootDb.listaDePrecios.delete({ where: { id: input.id } });

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: "superadmin.precios.promo.eliminar",
        entity: "ListaDePrecios",
        entityId: promo.id,
        metadata: { motivo: input.motivo, nombre: promo.nombre },
      },
    });

    revalidatePath("/superadmin/precios");
    revalidatePath("/");
    revalidatePath("/facturacion");
  },
});

/**
 * Deja los tramos de una lista exactamente como llegaron del formulario.
 *
 * Se borra y se reescribe en vez de conciliar fila por fila: son cuatro o cinco
 * escalones que se editan a mano una vez por año, y el `deleteMany` + `createMany`
 * dentro de la misma transacción no puede dejar una lista a medio actualizar
 * —que es lo único que importa acá, porque de esos números sale el cobro—.
 */
async function reemplazarTramos(
  tx: Prisma.TransactionClient,
  listaId: string,
  tramos: { desdeSedes: number; precioMensualCop: number }[],
) {
  await tx.tramoDePrecios.deleteMany({ where: { listaId } });
  if (tramos.length === 0) return;
  await tx.tramoDePrecios.createMany({
    data: tramos.map((t) => ({ listaId, ...t })),
  });
}

/** Crear o editar una promoción con fecha de inicio y fin. */
export const guardarPromocion = definePublicAction({
  schema: guardarPromocionSchema,
  async handler({ input }) {
    const superAdmin = await getSuperAdmin();
    if (!superAdmin) redirect("/superadmin/ingresar");

    if (input.desde && input.hasta && input.hasta <= input.desde) {
      throw new ErrorDeUsuario("La promoción tiene que terminar después de empezar.");
    }

    const datos = {
      nombre: input.nombre,
      precioSedePrincipalCop: input.precioSedePrincipalCop,
      precioSedeAdicionalCop: input.precioSedeAdicionalCop,
      mesesGratisSemestral: input.mesesGratisSemestral,
      mesesGratisAnual: input.mesesGratisAnual,
      desde: input.desde,
      hasta: input.hasta,
      activa: input.activa,
    };

    // Una promoción SIN fechas sería otra lista base y competiría con ella: se
    // exige al menos un extremo para que siempre se sepa cuál es cuál.
    if (!input.desde && !input.hasta) {
      throw new ErrorDeUsuario(
        "Poné al menos una fecha. Una promoción sin inicio ni fin no es una promoción: es el precio de lista.",
      );
    }

    const guardada = await rootDb.$transaction(async (tx) => {
      const lista = input.id
        ? await tx.listaDePrecios.update({ where: { id: input.id }, data: datos })
        : await tx.listaDePrecios.create({ data: datos });

      await reemplazarTramos(tx, lista.id, input.tramos);
      return lista;
    });

    await rootDb.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: input.id ? "superadmin.precios.promo.editar" : "superadmin.precios.promo.crear",
        entity: "ListaDePrecios",
        entityId: guardada.id,
        metadata: {
          motivo: input.motivo,
          ...datos,
          tramos: input.tramos,
          desde: input.desde?.toISOString() ?? null,
          hasta: input.hasta?.toISOString() ?? null,
        },
      },
    });

    revalidatePath("/superadmin/precios");
    revalidatePath("/");
    revalidatePath("/facturacion");
  },
});
