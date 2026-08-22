import "server-only";
import { Role } from "@/generated/prisma/enums";
// eslint-disable-next-line no-restricted-imports -- Contar las sedes de una persona cruza negocios por definición: no hay un businessId con el cual acotar.
import { rootDb } from "@/lib/db/root";
import { tenantDb } from "@/lib/db/tenant";

/** La suscripción del negocio con su historial de cobros. */
export async function getFacturacion(businessId: string) {
  const db = tenantDb(businessId);

  // Todo intento de pago pendiente con más de 15 minutos sin confirmarse
  // pasa automáticamente a RECHAZADO por seguridad y orden operativo.
  const hace15Min = new Date(Date.now() - 15 * 60 * 1000);
  await db.subscriptionPayment.updateMany({
    where: {
      businessId,
      status: "PENDIENTE",
      createdAt: { lt: hace15Min },
    },
    data: {
      status: "RECHAZADO",
      mpStatusDetail: "expirado_por_tiempo",
    },
  });

  const [suscripcion, pagos] = await Promise.all([
    db.subscription.findFirst({
      select: {
        id: true,
        status: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        graceUntil: true,
        canceledAt: true,
      },
    }),
    db.subscriptionPayment.findMany({
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        amountCop: true,
        status: true,
        method: true,
        paidAt: true,
        createdAt: true,
        periodEnd: true,
        mesesOtorgados: true,
        periodicidad: true,
        sedes: true,
      },
    }),
  ]);

  return { suscripcion, pagos };
}

/**
 * Cuántas sedes tiene esta persona.
 *
 * Es lo que decide el precio: la primera cuesta una cosa y cada una que sigue
 * suma otra. Se cuenta por membresías de PROPIETARIO activas, que es la única
 * noción de "cuenta" que existe en el modelo —no hay una tabla de organización— y
 * es la misma que ya usa `crearSucursalAdicional` para decidir el cupo.
 */
export async function sedesDelPropietario(userId: string): Promise<number> {
  const cuantas = await rootDb.membership.count({
    where: {
      userId,
      role: Role.PROPIETARIO,
      active: true,
      business: { deletedAt: null },
    },
  });
  return Math.max(1, cuantas);
}
