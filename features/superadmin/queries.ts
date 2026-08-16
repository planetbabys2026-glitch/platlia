import "server-only";
// Superadministración: mira todas las empresas por definición, así que no hay
// businessId con el cual acotar. Es una de las tres excepciones previstas.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";

/**
 * El panorama de todos los negocios.
 *
 * Trae cuentas, no contenido: cuántas mesas y cuántos pedidos, no qué vendieron.
 * Dar soporte no requiere leerle la operación a nadie, y lo que no se muestra no
 * se puede filtrar.
 */
export async function getNegocios() {
  const negocios = await rootDb.business.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          priceCop: true,
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
    },
  });

  return negocios;
}

export async function getResumenPlataforma() {
  const [negocios, activos, usuarios, pagos] = await Promise.all([
    rootDb.business.count({ where: { deletedAt: null } }),
    rootDb.subscription.count({ where: { status: { in: ["ACTIVA", "PRUEBA"] } } }),
    rootDb.user.count({ where: { deletedAt: null } }),
    rootDb.subscriptionPayment.aggregate({
      where: { status: "APROBADO" },
      _sum: { amountCop: true },
      _count: { _all: true },
    }),
  ]);

  return {
    negocios,
    conLicenciaViva: activos,
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
