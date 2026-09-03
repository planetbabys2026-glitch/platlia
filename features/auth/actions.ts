"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
// Autenticación: resuelve al usuario y crea la empresa ANTES de que exista un
// businessId con el que acotar. Es una de las tres excepciones previstas por la
// regla (auth, billing, superadmin).
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { AppModule, Role, SubscriptionStatus, TaxKind } from "@/generated/prisma/enums";
import { definePublicAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { CUPOS } from "@/lib/seguridad/limite";
import { hashPassword, hashSenuelo, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  readSession,
  revokeAllSessions,
  setSessionBusiness,
} from "@/lib/auth/session";
import { emitirToken, emitidoHaceMenosDe, consumirToken } from "@/features/auth/tokens";
import {
  crearNegocioSchema,
  elegirNegocioSchema,
  ingresarSchema,
  registroSchema,
  restablecerPasswordSchema,
  solicitarRecuperacionSchema,
} from "@/features/auth/schemas";
import { env } from "@/lib/env";
import { correoDeRecuperacion, correoDeVerificacion } from "@/lib/email/plantillas";
import { enviarCorreoDespues } from "@/lib/email/despues";

const DIA_MS = 86_400_000;
const DIAS_DE_PRUEBA = 7;

/** Tras 10 intentos fallidos la cuenta descansa 15 minutos. */
const INTENTOS_MAXIMOS = 10;
const BLOQUEO_MINUTOS = 15;

const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

/**
 * Lo que se contesta cuando alguien se registra con un correo que ya existe.
 *
 * Uno solo para todos los casos: quien ya tiene negocio, quien tiene cuenta sin
 * negocio y quien quedó dado de baja. La pantalla lo acompaña con los dos
 * caminos que sirven —ingresar y recuperar la contraseña—, así que decir de más
 * no ayudaría a nadie salvo a quien está probando correos ajenos.
 */
const CORREO_YA_REGISTRADO = "Ese correo ya tiene una cuenta en Platlia.";

function aSlug(texto: string): string {
  const limpio = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca las tildes y la ñ pasa a n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return limpio || "negocio";
}

async function slugLibre(base: string): Promise<string> {
  const candidato = aSlug(base);
  for (let i = 0; i < 50; i++) {
    const intento = i === 0 ? candidato : `${candidato}-${i + 1}`;
    const tomado = await rootDb.business.findUnique({
      where: { slug: intento },
      select: { id: true },
    });
    if (!tomado) return intento;
  }
  return `${candidato}-${Date.now().toString(36)}`;
}

/**
 * Crea una empresa con todo lo que necesita para operar desde el primer minuto:
 * parámetros colombianos por defecto, las tres tarifas de impuesto, los módulos
 * encendidos y la licencia de prueba corriendo.
 */
async function crearNegocio(nombre: string, userId: string) {
  const slug = await slugLibre(nombre);
  const finPrueba = new Date(Date.now() + DIAS_DE_PRUEBA * DIA_MS);

  return rootDb.business.create({
    data: {
      name: nombre,
      slug,
      settings: { create: {} },
      // Sin una caja física no se puede abrir turno, y sin turno no se cobra: un
      // negocio recién creado tiene que poder vender antes de pasar por
      // Configuración. Las demás las agrega el dueño cuando tenga más de un
      // punto de cobro.
      cashRegisters: { create: { name: "Caja 1" } },
      memberships: { create: { userId, role: Role.PROPIETARIO } },
      modules: { create: Object.values(AppModule).map((module) => ({ module })) },
      taxRates: {
        create: [
          {
            name: "Impuesto al consumo",
            kind: TaxKind.IMPOCONSUMO,
            rateBp: 800,
            isDefault: true,
          },
          { name: "IVA", kind: TaxKind.IVA, rateBp: 1900 },
          { name: "Exento", kind: TaxKind.EXENTO, rateBp: 0 },
        ],
      },
      subscription: {
        create: {
          status: SubscriptionStatus.PRUEBA,
          trialEndsAt: finPrueba,
          currentPeriodStart: new Date(),
          currentPeriodEnd: finPrueba,
          graceUntil: finPrueba,
        },
      },
    },
    select: { id: true },
  });
}

export const ingresar = definePublicAction({
  schema: ingresarSchema,
  // El bloqueo por cuenta que hay más abajo (10 intentos y descansa) frena a
  // quien insiste contra UNA cuenta. Lo que no ve es el rociado: una contraseña
  // probable contra doscientos correos distintos no llega a diez en ninguna, así
  // que ninguna se bloquea nunca. Eso lo frena el cupo por procedencia.
  protecciones: { limite: CUPOS.ingresar, turnstile: true, trampa: true },
  // El handler nunca devuelve —termina en `redirect`—, así que acá cualquier
  // valor sirve para el tipo. Lo que importa es que la pantalla quede igual que
  // tras un intento fallido: sin sesión y sin decir por qué.
  respuestaParaTrampa: () => undefined as never,
  async handler({ input }) {
    const user = await rootDb.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        isSuperAdmin: true,
        deletedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        memberships: { where: { active: true }, select: { businessId: true }, take: 2 },
      },
    });

    if (user?.isSuperAdmin) {
      throw new ErrorDeUsuario(
        "Los superadministradores deben ingresar exclusivamente desde la consola de soporte (/superadmin/ingresar).",
      );
    }

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new ErrorDeUsuario(
        `Demasiados intentos fallidos. Probá de nuevo en ${BLOQUEO_MINUTOS} minutos.`,
      );
    }

    // Se verifica siempre, aunque el usuario no exista: es lo que iguala el tiempo.
    const coincide = await verifyPassword(
      user?.passwordHash ?? (await hashSenuelo()),
      input.password,
    );

    if (!user || !coincide || user.status !== "ACTIVO" || user.deletedAt) {
      if (user) {
        const intentos = user.failedLoginAttempts + 1;
        await rootDb.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: intentos,
            lockedUntil:
              intentos >= INTENTOS_MAXIMOS
                ? new Date(Date.now() + BLOQUEO_MINUTOS * 60_000)
                : null,
          },
        });
      }
      throw new ErrorDeUsuario(CREDENCIALES_INVALIDAS);
    }

    await rootDb.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // Con un solo negocio se entra directo; con varios, la sesión arranca sin
    // empresa y el DAL manda a elegir.
    const businessId = user.memberships.length === 1 ? user.memberships[0].businessId : null;
    await createSession({ userId: user.id, businessId });

    // Solo se acepta una ruta interna: `desde` viene de la URL y con un valor
    // absoluto se convertiría en un redirect abierto hacia otro dominio.
    const destino =
      input.desde?.startsWith("/") && !input.desde.startsWith("//") ? input.desde : "/panel";
    redirect(destino);
  },
});

export const registrarse = definePublicAction({
  schema: registroSchema,
  // Es la puerta más cara del producto: cada registro deja un negocio, una
  // suscripción, una caja y las tarifas de impuesto. Sin freno, un script llena
  // la base de cuentas de prueba en una tarde.
  protecciones: { limite: CUPOS.registro, turnstile: true, trampa: true },
  // Igual que en ingresar: el camino bueno redirige, así que no hay forma de
  // distinguirlos mirando la respuesta.
  respuestaParaTrampa: () => undefined as never,
  async handler({ input }) {
    const existente = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true, isSuperAdmin: true },
    });

    if (existente?.isSuperAdmin) {
      throw new ErrorDeUsuario(
        "Los superadministradores deben ingresar exclusivamente desde la consola de soporte (/superadmin/ingresar).",
      );
    }

    // Un correo que ya existe NO se registra, tenga negocio o no.
    //
    // Antes esta guarda solo miraba las membresías activas, y el correo que
    // existía sin ninguna —un empleado dado de baja, un registro abandonado—
    // caía en un `let userId = existente.id` que seguía de largo: se le creaba
    // un negocio y se le abría sesión SIN verificar nunca la contraseña
    // tecleada, que quedaba descartada en silencio. O sea que conocer el correo
    // de alguien alcanzaba para entrar como esa persona. Acá no hay forma de
    // resolverlo bien: para adoptar una cuenta habría que probar su contraseña,
    // y eso ya es la pantalla de ingreso.
    //
    // El mensaje es el mismo para los dos casos a propósito. Distinguir "existe
    // con negocio" de "existe sin negocio" es contarle a cualquiera que pruebe
    // correos en qué estado está esa cuenta. Y tampoco se nombra la empresa
    // —antes decía «ya está vinculado a la empresa "Bar La Esquina"»—: eso le
    // confirma a un desconocido quién tiene cuenta y dónde trabaja.
    if (existente) {
      throw new ErrorDeUsuario(CORREO_YA_REGISTRADO, { email: [CORREO_YA_REGISTRADO] });
    }

    const user = await rootDb.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true },
    });
    const userId = user.id;

    const negocio = await crearNegocio(input.nombreNegocio, userId);
    await createSession({ userId, businessId: negocio.id });

    // No bloquea: que Resend esté caído no puede impedir que el negocio quede creado.
    const token = await emitirToken(userId, "EMAIL_VERIFICATION");
    const verificacion = correoDeVerificacion({
      nombre: input.name,
      urlDeVerificacion: `${env.APP_URL}/verificar-correo?token=${token}`,
    });
    enviarCorreoDespues({
      para: input.email,
      asunto: verificacion.asunto,
      html: verificacion.html,
      texto: verificacion.texto,
      contexto: `verificación de correo para ${input.email}`,
    });

    redirect("/panel");
  },
});

const COOLDOWN_REENVIO_MS = 60_000;

/**
 * La única respuesta de "recuperar contraseña", exista o no la cuenta.
 *
 * Es una constante porque ahora la devuelven dos caminos —el normal y el de la
 * trampa—: escrita dos veces, alcanzaba con que una cambiara para que la
 * respuesta al robot se distinguiera de la buena, y ahí la trampa deja de serlo.
 */
const MENSAJE_RECUPERACION =
  "Si ese correo tiene una cuenta, ya le mandamos cómo recuperar la contraseña.";

export const solicitarRecuperacion = definePublicAction({
  schema: solicitarRecuperacionSchema,
  // Cada intento manda un correo a una dirección que elige quien pide, así que
  // sin freno es un cañón de spam apuntando a donde quieran. El enfriamiento de
  // 60 s que ya había es POR CUENTA: no frena pedir uno por cada correo de una
  // lista.
  protecciones: { limite: CUPOS.recuperar, turnstile: true, trampa: true },
  // Acá la pantalla SÍ lee lo que vuelve (`estado.data.mensaje`), así que la
  // trampa tiene que devolver la misma forma —y el mismo texto— que el camino
  // bueno. Devolver `undefined` rompía la página con un TypeError, que es
  // cualquier cosa menos indistinguible del éxito.
  respuestaParaTrampa: () => ({ mensaje: MENSAJE_RECUPERACION }),
  async handler({ input }) {
    const user = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, status: true, deletedAt: true },
    });

    // Se manda el correo solo si hay cuenta activa, pero SIEMPRE se contesta lo
    // mismo: decir "ese correo no existe" es regalarle a cualquiera la lista de
    // quién tiene cuenta en el negocio.
    if (user && user.status === "ACTIVO" && !user.deletedAt) {
      const yaPedido = await emitidoHaceMenosDe(
        user.id,
        "PASSWORD_RESET",
        COOLDOWN_REENVIO_MS,
      );
      if (!yaPedido) {
        const token = await emitirToken(user.id, "PASSWORD_RESET");
        const recuperacion = correoDeRecuperacion({
          urlDeRestablecer: `${env.APP_URL}/restablecer-contrasena?token=${token}`,
        });
        enviarCorreoDespues({
          para: input.email,
          asunto: recuperacion.asunto,
          html: recuperacion.html,
          texto: recuperacion.texto,
          contexto: `recuperación de contraseña para ${input.email}`,
        });
      }
    }

    return { mensaje: MENSAJE_RECUPERACION };
  },
});

export const restablecerContrasena = definePublicAction({
  schema: restablecerPasswordSchema,
  async handler({ input }) {
    const resultado = await consumirToken(input.token, "PASSWORD_RESET");
    if (!resultado.ok) {
      throw new ErrorDeUsuario(
        resultado.motivo === "usado"
          ? "Ese enlace ya se usó. Pedí uno nuevo."
          : "Ese enlace venció o no es válido. Pedí uno nuevo.",
      );
    }

    await rootDb.user.update({
      where: { id: resultado.userId },
      data: {
        passwordHash: await hashPassword(input.password),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Si el motivo para cambiarla fue que alguien más la sabía, dejar sus
    // sesiones abiertas no arregla nada.
    await revokeAllSessions(resultado.userId);

    redirect("/ingresar?restablecida=1");
  },
});

export const reenviarVerificacion = definePublicAction({
  schema: z.object({}),
  async handler() {
    const sesion = await readSession("APP");
    if (!sesion) redirect("/ingresar");

    const user = await rootDb.user.findUnique({
      where: { id: sesion.userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user) redirect("/ingresar");
    if (user.emailVerifiedAt) return { mensaje: "Ese correo ya estaba confirmado." };

    const yaPedido = await emitidoHaceMenosDe(user.id, "EMAIL_VERIFICATION", COOLDOWN_REENVIO_MS);
    if (yaPedido) {
      throw new ErrorDeUsuario("Ya te mandamos un correo hace un momento. Revisá tu bandeja.");
    }

    const token = await emitirToken(user.id, "EMAIL_VERIFICATION");
    const verificacion = correoDeVerificacion({
      nombre: user.name,
      urlDeVerificacion: `${env.APP_URL}/verificar-correo?token=${token}`,
    });
    enviarCorreoDespues({
      para: user.email,
      asunto: verificacion.asunto,
      html: verificacion.html,
      texto: verificacion.texto,
      contexto: `reenvío de verificación para ${user.email}`,
    });

    return { mensaje: "Te mandamos un correo nuevo." };
  },
});

export const crearNegocioPropio = definePublicAction({
  schema: crearNegocioSchema,
  async handler({ input }) {
    const sesion = await readSession("APP");
    if (!sesion) redirect("/ingresar");

    // El onboarding es para quien todavía no tiene ningún negocio, y hasta acá eso
    // se verificaba SOLO en la página, que redirige si ya tenés membresías. Pero
    // una Server Action es un POST alcanzable con curl sin pasar por ninguna
    // página: cualquiera con sesión podía fabricarse negocios en serie, cada uno
    // con siete días de prueba nuevos. Quien quiere una sede más pasa por
    // `crearSucursalAdicional`, que sí cobra y respeta el cupo.
    const yaTiene = await rootDb.membership.count({
      where: { userId: sesion.userId, active: true, business: { deletedAt: null } },
    });
    if (yaTiene > 0) {
      throw new ErrorDeUsuario(
        "Ya tenés un negocio. Para abrir otra sede usá «Crear nueva sucursal» desde el selector de negocios.",
      );
    }

    const negocio = await crearNegocio(input.nombreNegocio, sesion.userId);
    await setSessionBusiness(sesion.sessionId, negocio.id);
    redirect("/panel");
  },
});

export const elegirNegocio = definePublicAction({
  schema: elegirNegocioSchema,
  async handler({ input }) {
    const sesion = await readSession("APP");
    if (!sesion) redirect("/ingresar");

    // El businessId llega del formulario y podría ser el de cualquier otra
    // empresa: la membresía se verifica siempre.
    const membresia = await rootDb.membership.findUnique({
      where: { userId_businessId: { userId: sesion.userId, businessId: input.businessId } },
      select: { active: true },
    });
    if (!membresia?.active) throw new ErrorDeUsuario("No trabajás en ese negocio.");

    await setSessionBusiness(sesion.sessionId, input.businessId);
    redirect("/panel");
  },
});

export async function salir() {
  await destroySession("APP");
  redirect("/ingresar");
}
