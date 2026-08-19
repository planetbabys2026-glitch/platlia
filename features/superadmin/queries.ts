import "server-only";
import { Role } from "@/generated/prisma/enums";
// Superadministración: mira todas las empresas por definición, así que no hay
// businessId con el cual acotar. Es una de las tres excepciones previstas.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";

/** Una sede dentro de una cuenta. */
export type SedeDeConsola = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  subscription: {
    status: string;
    maxBranches: number;
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
  } | null;
  settings: {
    facturacionElectronicaHabilitada: boolean;
    paquetesDocumentosDisponibles: number;
    documentosEmitidosConsumidos: number;
  } | null;
  _count: { memberships: number; tables: number; products: number; orders: number };
};

/**
 * Una cuenta: todas las sedes de un mismo dueño bajo una sola licencia.
 *
 * Es la unidad que le importa a soporte. La licencia ya era de la cuenta y no de
 * la sede —`lib/billing/cuenta.ts` cobra por la más vieja y `sincronizarSedes`
 * iguala las fechas del resto—, pero la consola seguía listando un `Business` por
 * fila: un dueño con dos locales aparecía como dos negocios con dos licencias, y
 * extenderle una dejaba la otra vencida sin que nada fallara.
 */
export type CuentaDeConsola = {
  /** Identificador estable de la fila. El id del dueño, o el de la sede si no tiene. */
  clave: string;
  duenoId: string | null;
  duenoNombre: string;
  duenoCorreo: string | null;
  /** La sede que cobra: la más vieja. Es la que manda en la licencia. */
  principal: SedeDeConsola;
  /** Todas las sedes de la cuenta, la principal primero. */
  sedes: SedeDeConsola[];
  /** Los contadores de uso sumados entre todas las sedes. */
  totales: { memberships: number; tables: number; products: number; orders: number };
};

const SELECT_SEDE = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  subscription: {
    select: {
      status: true,
      maxBranches: true,
      trialEndsAt: true,
      // currentPeriodStart lo pide el tipo PeriodoSuscripcion de lib/billing.
      currentPeriodStart: true,
      currentPeriodEnd: true,
      graceUntil: true,
    },
  },
  settings: {
    select: {
      facturacionElectronicaHabilitada: true,
      paquetesDocumentosDisponibles: true,
      documentosEmitidosConsumidos: true,
    },
  },
  _count: { select: { memberships: true, tables: true, products: true, orders: true } },
} as const;

/**
 * El panorama de la plataforma, agrupado por cuenta.
 *
 * Trae cuentas, no contenido: cuántas mesas y cuántos pedidos, no qué vendieron.
 * Dar soporte no requiere leerle la operación a nadie, y lo que no se muestra no
 * se puede filtrar.
 *
 * Es la vuelta inversa de `cuentaDelPropietario`, que va de una persona a sus
 * sedes: acá hay que ir de todas las sedes a sus cuentas de una sola pasada.
 *
 * **Cada sede pertenece a exactamente una cuenta**, la de su propietario más
 * antiguo. Un negocio puede tener dos propietarios y en ese caso aparece bajo uno
 * solo; agrupar por "comparten algún dueño" sería transitivo y terminaría uniendo
 * cuentas que ni `cuentaDelPropietario` ni `sedesDeLaMismaCuenta` —que hacen un
 * solo salto— consideran la misma.
 */
export async function getCuentas(): Promise<CuentaDeConsola[]> {
  const negocios = await rootDb.business.findMany({
    where: { deletedAt: null },
    // Ascendente: la primera de cada grupo es la más vieja, o sea la principal.
    // Mismo criterio que `cuentaDelPropietario`: `business.createdAt`.
    orderBy: { createdAt: "asc" },
    select: {
      ...SELECT_SEDE,
      memberships: {
        where: { role: Role.PROPIETARIO, active: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  const porCuenta = new Map<string, CuentaDeConsola>();

  for (const negocio of negocios) {
    const { memberships, ...sede } = negocio;
    const dueno = memberships[0]?.user ?? null;

    // Un negocio sin propietario activo es su propia cuenta. No debería pasar,
    // pero esconderlo de la consola sería justo lo contrario de lo que necesita
    // quien da soporte.
    const clave = dueno ? `u:${dueno.id}` : `b:${sede.id}`;
    const existente = porCuenta.get(clave);

    if (existente) {
      existente.sedes.push(sede);
      existente.totales.memberships += sede._count.memberships;
      existente.totales.tables += sede._count.tables;
      existente.totales.products += sede._count.products;
      existente.totales.orders += sede._count.orders;
      continue;
    }

    porCuenta.set(clave, {
      clave,
      duenoId: dueno?.id ?? null,
      duenoNombre: dueno?.name ?? "Sin propietario",
      duenoCorreo: dueno?.email ?? null,
      principal: sede,
      sedes: [sede],
      totales: { ...sede._count },
    });
  }

  return [...porCuenta.values()];
}

/**
 * Los agregados de plataforma que no salen de agrupar cuentas.
 *
 * Las cuentas, las sedes y las licencias vivas se derivan de `getCuentas()`: si
 * se contaran acá con un `count` sobre `business` volverían a inflarse con cada
 * sucursal, que es exactamente el número equivocado que mostraba la portada.
 */
export async function getResumenPlataforma() {
  const [usuarios, pagos] = await Promise.all([
    rootDb.user.count({ where: { deletedAt: null } }),
    rootDb.subscriptionPayment.aggregate({
      where: { status: "APROBADO" },
      _sum: { amountCop: true },
      _count: { _all: true },
    }),
  ]);

  return {
    usuarios,
    recaudadoCop: pagos._sum.amountCop ?? 0,
    pagosAprobados: pagos._count._all,
  };
}

/**
 * El equipo de superadministración: quién más tiene esta puerta.
 *
 * Por creación, el más viejo primero: es el orden en que se fueron sumando las
 * personas de confianza a la consola.
 */
export async function getSuperAdmins() {
  return rootDb.user.findMany({
    where: { isSuperAdmin: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      lockedUntil: true,
      createdAt: true,
    },
  });
}

/**
 * Avisos de MercadoPago que fallaron.
 *
 * Es la primera pantalla que se mira cuando alguien dice "pagué y no me
 * activaron": si el aviso llegó y falló, está acá con su error.
 */
export async function getWebhooksConError() {
  return rootDb.mpWebhookEvent.findMany({
    where: { error: { not: null } },
    orderBy: { receivedAt: "desc" },
    take: 20,
    select: { id: true, mpEventId: true, type: true, error: true, receivedAt: true },
  });
}

/**
 * Bitácora de auditoría de superadministradores.
 * Muestra qué superadmin otorgó extensiones de licencia, suspenciones, reactivaciones y cambios de equipo.
 */
export async function getAuditLogs() {
  return rootDb.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      business: { select: { id: true, name: true, slug: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Historial de pagos e intentos de adquisición de licencias (MercadoPago).
 * Muestra tanto cobros aprobados como fallidos/rechazados y eventos de webhook recibidos.
 */
export async function getPagosEIntentos() {
  const [pagos, webhooks] = await Promise.all([
    rootDb.subscriptionPayment.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        amountCop: true,
        status: true,
        mpPaymentId: true,
        mpPreferenceId: true,
        mpStatusDetail: true,
        method: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        createdAt: true,
        business: { select: { id: true, name: true, slug: true } },
      },
    }),
    rootDb.mpWebhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 100,
      select: {
        id: true,
        mpEventId: true,
        type: true,
        error: true,
        receivedAt: true,
        processedAt: true,
      },
    }),
  ]);

  return { pagos, webhooks };
}

/** Todas las listas de precios: la base y las promociones, vigentes o no. */
export async function getListasDePrecios() {
  return rootDb.listaDePrecios.findMany({
    orderBy: [{ desde: "asc" }, { createdAt: "asc" }],
    include: { tramos: { orderBy: { desdeSedes: "asc" } } },
  });
}

// ─── Facturación electrónica: la bolsa de documentos ─────────────────────────

/**
 * Cuántos documentos electrónicos compramos, cuántos repartimos y cuántos se
 * gastaron.
 *
 * Antes solo existía el contador por negocio: se asignaba sin saber contra qué,
 * así que la única forma de descubrir que la bolsa se había agotado era que un
 * cliente no pudiera facturar en medio del servicio.
 */
export async function getBolsaDocumentosDian() {
  const [compras, repartidos] = await Promise.all([
    rootDb.compraDocumentosDian.aggregate({ _sum: { cantidad: true, costoCop: true } }),
    rootDb.businessSettings.aggregate({
      _sum: { paquetesDocumentosDisponibles: true, documentosEmitidosConsumidos: true },
    }),
  ]);

  const comprados = compras._sum.cantidad ?? 0;
  const asignados = repartidos._sum.paquetesDocumentosDisponibles ?? 0;
  const consumidos = repartidos._sum.documentosEmitidosConsumidos ?? 0;

  return {
    comprados,
    asignados,
    consumidos,
    /** Lo que todavía se puede repartir. Nunca negativo. */
    sinAsignar: Math.max(0, comprados - asignados),
    invertidoCop: compras._sum.costoCop ?? 0,
  };
}

/** Las compras de documentos, para el historial de la consola. */
export async function getComprasDocumentosDian() {
  return rootDb.compraDocumentosDian.findMany({
    orderBy: { compradoEn: "desc" },
    take: 50,
  });
}

/** Cada negocio con su estado fiscal, para repartir la bolsa con criterio. */
export async function getNegociosConFacturacion() {
  const negocios = await rootDb.business.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      taxId: true,
      settings: {
        select: {
          facturacionElectronicaHabilitada: true,
          paquetesDocumentosDisponibles: true,
          documentosEmitidosConsumidos: true,
          factusNumberingRangeId: true,
          factusNumberingRangeIdNc: true,
          municipalityCode: true,
        },
      },
    },
  });

  return negocios.map((n) => ({
    id: n.id,
    nombre: n.name,
    nit: n.taxId,
    habilitada: n.settings?.facturacionElectronicaHabilitada ?? false,
    asignados: n.settings?.paquetesDocumentosDisponibles ?? 0,
    consumidos: n.settings?.documentosEmitidosConsumidos ?? 0,
    numberingRangeId: n.settings?.factusNumberingRangeId ?? null,
    numberingRangeIdNc: n.settings?.factusNumberingRangeIdNc ?? null,
    municipalityCode: n.settings?.municipalityCode ?? null,
  }));
}
