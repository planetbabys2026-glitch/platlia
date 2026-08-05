import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/** La suscripción del negocio con su historial de cobros. */
export async function getFacturacion(businessId: string) {
  const db = tenantDb(businessId);

  const [suscripcion, pagos] = await Promise.all([
    db.subscription.findFirst({
      select: {
        id: true,
        status: true,
        priceCop: true,
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
      },
    }),
  ]);

  return { suscripcion, pagos };
}
