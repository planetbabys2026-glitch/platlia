import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { rootDb } from "@/lib/db/root";

/** El cliente dentro de una `$transaction`. Es el que reciben los helpers de acá. */
type Tx = Prisma.TransactionClient;

/**
 * La cuenta de facturación de una persona: todas sus sedes bajo una sola licencia.
 *
 * El modelo de datos no tiene una tabla de "cuenta" —cada `Business` tiene su
 * `Subscription`— y esa ausencia dejó un cobro duplicado: como el precio depende
 * de cuántas sedes hay, cada sede cotizaba `50.000 + 30.000×(n−1)` por su cuenta,
 * y pagar dos sedes salía $160.000 en vez de $80.000.
 *
 * La cuenta es implícita y siempre lo fue: las membresías de PROPIETARIO de una
 * persona. La **principal** es la sede más vieja, y es la única que cobra; las
 * demás viven con sus mismas fechas. Es la misma noción que ya usaba
 * `crearSucursalAdicional` para decidir el cupo de sucursales.
 */

export type CuentaDeFacturacion = {
  /** La sede que cobra: la más vieja. */
  principalBusinessId: string;
  principalNombre: string;
  subscriptionId: string;
  status: string;
  maxBranches: number;
  /** "MENSUAL" | "ANUAL" si el débito automático está encendido; null si no. */
  cobroAutomatico: string | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  /** Cuántas sedes cubre esta licencia. */
  sedes: number;
  /** Los ids de todas las sedes, para sincronizarlas cuando entra un pago. */
  businessIds: string[];
};

export const cuentaDelPropietario = cache(
  async (userId: string): Promise<CuentaDeFacturacion | null> => {
    const membresias = await rootDb.membership.findMany({
      where: {
        userId,
        role: Role.PROPIETARIO,
        active: true,
        business: { deletedAt: null },
      },
      select: {
        business: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            subscription: {
              select: {
                id: true,
                status: true,
                maxBranches: true,
                cobroAutomatico: true,
                trialEndsAt: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                graceUntil: true,
              },
            },
          },
        },
      },
    });

    if (membresias.length === 0) return null;

    // La más vieja manda. Es un criterio estable —no cambia al agregar ni al
    // borrar sedes nuevas— y coincide con la que la persona registró primero,
    // que es la que ya venía pagando.
    const sedes = membresias
      .map((m) => m.business)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const principal = sedes.find((s) => s.subscription) ?? sedes[0];
    if (!principal.subscription) return null;

    return {
      principalBusinessId: principal.id,
      principalNombre: principal.name,
      subscriptionId: principal.subscription.id,
      status: principal.subscription.status,
      maxBranches: principal.subscription.maxBranches,
      cobroAutomatico: principal.subscription.cobroAutomatico,
      trialEndsAt: principal.subscription.trialEndsAt,
      currentPeriodStart: principal.subscription.currentPeriodStart,
      currentPeriodEnd: principal.subscription.currentPeriodEnd,
      graceUntil: principal.subscription.graceUntil,
      sedes: sedes.length,
      businessIds: sedes.map((s) => s.id),
    };
  },
);

/**
 * Las sedes que comparten dueño con ésta.
 *
 * El webhook llega sin sesión: no sabe de qué usuario es el pago, solo de qué
 * negocio. Se llega al resto por el propietario de ese negocio, que es la misma
 * definición de cuenta que usa `cuentaDelPropietario`.
 */
export async function sedesDeLaMismaCuenta(tx: Tx, businessId: string): Promise<string[]> {
  const duenos = await tx.membership.findMany({
    where: { businessId, role: Role.PROPIETARIO, active: true },
    select: { userId: true },
  });
  if (duenos.length === 0) return [businessId];

  const todas = await tx.membership.findMany({
    where: {
      userId: { in: duenos.map((d) => d.userId) },
      role: Role.PROPIETARIO,
      active: true,
      business: { deletedAt: null },
    },
    select: { businessId: true },
  });

  return Array.from(new Set([businessId, ...todas.map((m) => m.businessId)]));
}

/**
 * La sede principal de la cuenta a la que pertenece `businessId`, junto con los
 * ids de todo el grupo.
 *
 * Es la contracara de `cuentaDelPropietario` para cuando no hay sesión y solo se
 * tiene una sede en la mano: la necesitan el webhook y las acciones de soporte,
 * que reciben un negocio y tienen que actuar sobre la cuenta entera.
 *
 * Elige con el mismo criterio que `cuentaDelPropietario`: la más vieja por
 * `business.createdAt`, prefiriendo una que tenga suscripción.
 */
export async function principalDeLaCuenta(
  tx: Tx,
  businessId: string,
): Promise<{
  principalBusinessId: string;
  subscriptionId: string | null;
  businessIds: string[];
}> {
  const businessIds = await sedesDeLaMismaCuenta(tx, businessId);

  const sedes = await tx.business.findMany({
    where: { id: { in: businessIds }, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, subscription: { select: { id: true } } },
  });

  const principal = sedes.find((s) => s.subscription) ?? sedes[0];

  return {
    principalBusinessId: principal?.id ?? businessId,
    subscriptionId: principal?.subscription?.id ?? null,
    businessIds,
  };
}

/**
 * Deja todas las sedes de una cuenta con las mismas fechas que la principal.
 *
 * Es lo que hace que "pagar la licencia" signifique pagar por todo el negocio y
 * no por un local: sin esto, extender la principal dejaba las demás vencidas y
 * bloqueadas aunque el dueño hubiera pagado por ellas.
 */
export async function sincronizarSedes(
  tx: Tx,
  args: {
    businessIds: string[];
    exceptoBusinessId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    graceUntil: Date;
    /**
     * Solo hace falta mientras la cuenta está en PRUEBA.
     *
     * `licenciaVigente` mira `graceUntil` y por eso alcanzaba con las tres fechas
     * de arriba para desbloquear a las hijas. Pero `diasParaElCorte` prefiere
     * `trialEndsAt` cuando el estado es PRUEBA, así que sin esto una sede hija
     * mostraba los días de la prueba vieja: trabajando bien y avisando mal.
     */
    trialEndsAt?: Date | null;
  },
): Promise<void> {
  const otras = args.businessIds.filter((id) => id !== args.exceptoBusinessId);
  if (otras.length === 0) return;

  await tx.subscription.updateMany({
    where: {
      businessId: { in: otras },
      // Lo cancelado y lo suspendido a mano no revive por un pago de otra sede:
      // son decisiones, igual que en `estadoSegunFechas`.
      status: { notIn: ["CANCELADA", "SUSPENDIDA"] },
    },
    data: {
      status: args.status as never,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      graceUntil: args.graceUntil,
      ...(args.trialEndsAt !== undefined ? { trialEndsAt: args.trialEndsAt } : {}),
    },
  });
}
