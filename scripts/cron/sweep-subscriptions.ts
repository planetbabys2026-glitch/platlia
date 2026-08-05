import { pool } from "@/lib/db/pool";
import { estadoSegunFechas } from "@/lib/billing/suscripcion";
import { rootDb } from "@/lib/db/root";

/**
 * Pone al día lo que el paso del tiempo cambió en las licencias.
 *
 * Nadie "vence" una suscripción: vence sola cuando pasa la fecha. Este script
 * solo escribe en la base lo que ya es cierto, para que el estado que ve el
 * negocio y el que dice el reloj no se contradigan.
 *
 * Corre una vez al día:
 *   0 6 * * *  cd /app && pnpm cron:subs
 *
 * Es idempotente: correrlo diez veces seguidas hace exactamente lo mismo que
 * correrlo una.
 */
async function main() {
  const ahora = new Date();

  const suscripciones = await rootDb.subscription.findMany({
    select: {
      id: true,
      status: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      graceUntil: true,
      business: { select: { name: true, slug: true } },
    },
  });

  const cambios: string[] = [];

  for (const sub of suscripciones) {
    const nuevo = estadoSegunFechas(sub, ahora);
    if (nuevo === sub.status) continue;

    await rootDb.subscription.update({ where: { id: sub.id }, data: { status: nuevo } });

    await rootDb.auditLog.create({
      data: {
        action: "licencia.estado.automatico",
        entity: "Subscription",
        entityId: sub.id,
        metadata: { de: sub.status, a: nuevo },
      },
    });

    cambios.push(`${sub.business.slug}: ${sub.status} → ${nuevo}`);
  }

  console.log(
    `Revisadas ${suscripciones.length} suscripciones. ${cambios.length} cambiaron de estado.`,
  );
  for (const cambio of cambios) console.log(`  · ${cambio}`);
}

main()
  .catch((error) => {
    console.error("El barrido de suscripciones falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await rootDb.$disconnect();
    await pool.end();
  });
