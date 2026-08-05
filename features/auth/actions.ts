"use server";

import { redirect } from "next/navigation";
// Autenticación: resuelve al usuario y crea la empresa ANTES de que exista un
// businessId con el que acotar. Es una de las tres excepciones previstas por la
// regla (auth, billing, superadmin).
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { AppModule, Role, SubscriptionStatus, TaxKind } from "@/generated/prisma/enums";
import { definePublicAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  readSession,
  setSessionBusiness,
} from "@/lib/auth/session";
import {
  crearNegocioSchema,
  elegirNegocioSchema,
  ingresarSchema,
  registroSchema,
} from "@/features/auth/schemas";

const DIA_MS = 86_400_000;
const DIAS_DE_PRUEBA = 7;
const DIAS_DE_GRACIA = 3;

/** Tras 10 intentos fallidos la cuenta descansa 15 minutos. */
const INTENTOS_MAXIMOS = 10;
const BLOQUEO_MINUTOS = 15;

/**
 * Hash señuelo: cuando el correo no existe se verifica contra él, para que
 * "no hay cuenta" y "contraseña incorrecta" tarden lo mismo y no se pueda
 * averiguar quién tiene cuenta midiendo el tiempo de respuesta.
 *
 * Se calcula de verdad, no es una constante escrita a mano: un hash inválido
 * haría que verifyPassword devolviera false al instante y la diferencia de
 * tiempo volvería a delatar al usuario. Se paga una sola vez por proceso.
 */
let senuelo: Promise<string> | undefined;
function hashSenuelo(): Promise<string> {
  senuelo ??= hashPassword("senuelo-que-jamas-coincide-con-nada");
  return senuelo;
}

const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

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
          graceUntil: new Date(finPrueba.getTime() + DIAS_DE_GRACIA * DIA_MS),
        },
      },
    },
    select: { id: true },
  });
}

export const ingresar = definePublicAction({
  schema: ingresarSchema,
  async handler({ input }) {
    const user = await rootDb.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        memberships: { where: { active: true }, select: { businessId: true }, take: 2 },
      },
    });

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
  async handler({ input }) {
    const existente = await rootDb.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existente) {
      throw new ErrorDeUsuario(
        "Ya hay una cuenta con ese correo. Ingresá o recuperá tu contraseña.",
        { email: ["Ya hay una cuenta con ese correo."] },
      );
    }

    const user = await rootDb.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true },
    });

    const negocio = await crearNegocio(input.nombreNegocio, user.id);
    await createSession({ userId: user.id, businessId: negocio.id });
    redirect("/panel");
  },
});

export const crearNegocioPropio = definePublicAction({
  schema: crearNegocioSchema,
  async handler({ input }) {
    const sesion = await readSession("APP");
    if (!sesion) redirect("/ingresar");

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
