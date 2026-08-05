import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { AppModule, Role } from "@/generated/prisma/enums";
import { licenciaVigente, tieneRol, type EstadoLicencia } from "@/lib/auth/reglas";
import { readSession, type SesionViva } from "@/lib/auth/session";
import { rootDb } from "@/lib/db/root";

// Las reglas puras viven en lib/auth/reglas.ts —sin "server-only", para poder
// probarlas— y se reexportan acá, que es por donde las busca el resto.
export { licenciaVigente, tieneRol };

/**
 * Capa de acceso a datos de autenticación: el único lugar donde se decide quién
 * es el usuario y qué puede hacer.
 *
 * Regla que sostiene todo esto: **cada `page.tsx` y cada Server Action verifica
 * por su cuenta**. Los layouts no sirven de frontera porque no se vuelven a
 * renderizar en una navegación del cliente: un layout que chequea permisos deja
 * pasar la segunda página. El layout de `(app)` solo pinta el shell.
 *
 * Todo está memoizado con `cache()` de React, así que llamar `requireBusiness()`
 * en la página, en el componente de la barra y en tres Server Actions del mismo
 * request cuesta una sola vuelta a la base.
 */

export type Contexto = {
  session: SesionViva;
  user: {
    id: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
    emailVerifiedAt: Date | null;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    timeZone: string;
    businessDayStartMinutes: number;
  } | null;
  role: Role | null;
  modules: ReadonlySet<AppModule>;
  licencia: EstadoLicencia;
};

/**
 * Sesión de superadministración.
 *
 * Es una puerta aparte: otra cookie (`pl_sa`, con path /superadmin), otro tipo de
 * sesión y otra verificación. Una sesión del producto NO abre esta puerta por más
 * que el usuario tenga la marca de superadministrador, y esa separación es a
 * propósito: quien da soporte entra a propósito, no por arrastre.
 */
export const getSuperAdmin = cache(async () => {
  const sesion = await readSession("SUPERADMIN");
  if (!sesion) return null;

  const user = await rootDb.user.findUnique({
    where: { id: sesion.userId },
    select: { id: true, name: true, email: true, isSuperAdmin: true, status: true },
  });

  // readSession ya lo verifica, pero esto no se deduce: se comprueba.
  if (!user?.isSuperAdmin || user.status !== "ACTIVO") return null;
  return user;
});

export async function requireSuperAdmin() {
  const superAdmin = await getSuperAdmin();
  if (!superAdmin) redirect("/superadmin/ingresar");
  return superAdmin;
}

/** Sin empresa seleccionada todavía, o sin sesión. */
export const getCurrentUser = cache(async () => {
  const sesion = await readSession("APP");
  if (!sesion) return null;

  return rootDb.user.findUnique({
    where: { id: sesion.userId },
    select: { id: true, name: true, email: true, isSuperAdmin: true, emailVerifiedAt: true },
  });
});

export const getContext = cache(async (): Promise<Contexto | null> => {
  const session = await readSession("APP");
  if (!session) return null;

  const user = await rootDb.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, isSuperAdmin: true, emailVerifiedAt: true },
  });
  if (!user) return null;

  if (!session.businessId) {
    return {
      session,
      user,
      business: null,
      role: null,
      modules: new Set(),
      licencia: { vigente: false, enGracia: false, venceEl: null },
    };
  }

  const business = await rootDb.business.findUnique({
    where: { id: session.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      deletedAt: true,
      settings: { select: { timeZone: true, businessDayStartMinutes: true } },
      subscription: {
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          graceUntil: true,
        },
      },
      modules: { where: { enabled: true }, select: { module: true } },
      memberships: {
        where: { userId: user.id, active: true },
        select: { role: true },
      },
    },
  });

  // Empresa borrada, suspendida, o el usuario ya no trabaja ahí: la sesión sigue
  // siendo válida pero sin empresa, y requireBusiness lo manda a elegir otra.
  const membresia = business?.memberships[0];
  if (!business || business.deletedAt || business.status !== "ACTIVO" || !membresia) {
    return {
      session,
      user,
      business: null,
      role: null,
      modules: new Set(),
      licencia: { vigente: false, enGracia: false, venceEl: null },
    };
  }

  return {
    session,
    user,
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      timeZone: business.settings?.timeZone ?? "America/Bogota",
      businessDayStartMinutes: business.settings?.businessDayStartMinutes ?? 300,
    },
    role: membresia.role,
    modules: new Set(business.modules.map((m) => m.module)),
    licencia: licenciaVigente(business.subscription),
  };
});

/** Hay sesión o se va a /ingresar. */
export async function requireUser() {
  const ctx = await getContext();
  if (!ctx) redirect("/ingresar");
  return ctx;
}

/**
 * Hay sesión y una empresa activa con membresía vigente.
 * Es el guardián por defecto de todo lo que vive bajo `(app)`.
 */
export async function requireBusiness() {
  const ctx = await requireUser();
  if (!ctx.business || !ctx.role) {
    // Sin ninguna membresía todavía es alguien que se registró y no creó su
    // negocio; con membresías es alguien que tiene que elegir cuál.
    const cuantas = await rootDb.membership.count({
      where: { userId: ctx.user.id, active: true },
    });
    redirect(cuantas === 0 ? "/onboarding" : "/elegir-negocio");
  }
  return ctx as Contexto & {
    business: NonNullable<Contexto["business"]>;
    role: Role;
  };
}

/** Además de empresa, licencia que deje trabajar hoy. */
export async function requireActiveLicense() {
  const ctx = await requireBusiness();
  if (!ctx.licencia.vigente) redirect("/bloqueado");
  return ctx;
}

/**
 * Rol suficiente. Falla con 404 y no con "no tenés permiso": si alguien llegó a
 * una URL que su rol no habilita, no hay razón para confirmarle que existe.
 */
export async function requireRole(...permitidos: readonly Role[]) {
  const ctx = await requireActiveLicense();
  if (!tieneRol(ctx.role, permitidos)) notFound();
  return ctx;
}

/** Módulo encendido para esta empresa. */
export async function requireModule(modulo: AppModule) {
  const ctx = await requireActiveLicense();
  if (!ctx.modules.has(modulo)) notFound();
  return ctx;
}
