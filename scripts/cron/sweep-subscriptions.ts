import { pool } from "@/lib/db/pool";
import { Role } from "@/generated/prisma/enums";
import { avisoQueCorresponde } from "@/lib/billing/avisos-licencia";
import { estadoSegunFechas } from "@/lib/billing/suscripcion";
import { rootDb } from "@/lib/db/root";
import { enviarCorreoSinBloquear } from "@/lib/email/enviar";
import { correoDeVencimiento } from "@/lib/email/plantillas";
import { env } from "@/lib/env";

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
 * Hace dos cosas: pone al día el estado, y **avisa antes de que se corte**. El
 * aviso vive acá y no en la aplicación porque nadie entra a Platlia para ver si
 * le queda licencia: se entera el día que no puede trabajar.
 *
 * Es idempotente: correrlo diez veces seguidas hace exactamente lo mismo que
 * correrlo una. Los correos también, gracias a `ultimoAvisoClave`.
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
      cobroAutomatico: true,
      ultimoAvisoClave: true,
      businessId: true,
      business: {
        select: {
          name: true,
          slug: true,
          memberships: {
            where: { role: Role.PROPIETARIO, active: true },
            select: { user: { select: { email: true } } },
          },
        },
      },
    },
  });

  const cambios: string[] = [];
  const avisados: string[] = [];

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

  // ── Avisos de vencimiento ─────────────────────────────────────────────────
  for (const sub of suscripciones) {
    const aviso = avisoQueCorresponde(sub);
    if (!aviso) continue;

    // Al propietario: es quien paga. Un mesero no puede hacer nada con este correo.
    const correos = sub.business.memberships.map((m) => m.user.email).filter(Boolean);
    if (correos.length === 0) continue;

    const { asunto, html, texto } = correoDeVencimiento({
      negocio: sub.business.name,
      diasRestantes: aviso.diasRestantes,
      urlDeFacturacion: `${env.APP_URL}/facturacion`,
    });

    // No bloquea: que Resend esté caído no puede dejar el barrido a medias ni
    // impedir que se marquen los demás avisos.
    await enviarCorreoSinBloquear({
      para: correos,
      asunto,
      html,
      texto,
      contexto: `aviso de vencimiento de ${sub.business.slug}`,
    });

    // La marca se escribe aunque el correo no haya salido: si Resend falla, el
    // reintento sería mañana con el mismo contenido, y un aviso repetido molesta
    // más de lo que ayuda. El fallo queda en el log de `enviarCorreoSinBloquear`.
    await rootDb.subscription.update({
      where: { id: sub.id },
      data: { ultimoAvisoClave: aviso.clave },
    });

    avisados.push(`${sub.business.slug}: faltan ${aviso.diasRestantes} días (umbral ${aviso.umbral})`);
  }

  // ── Barrido de intentos de pago pendientes abandonados (> 15 minutos) ───────
  const expirados = await rootDb.subscriptionPayment.updateMany({
    where: {
      status: "PENDIENTE",
      createdAt: { lt: new Date(ahora.getTime() - 15 * 60 * 1000) },
    },
    data: {
      status: "RECHAZADO",
      mpStatusDetail: "expirado_por_tiempo",
    },
  });

  console.log(
    `Revisadas ${suscripciones.length} suscripciones. ${cambios.length} cambiaron de estado, ${avisados.length} avisadas, ${expirados.count} pagos pendientes expirados.`,
  );
  for (const cambio of cambios) console.log(`  · ${cambio}`);
  for (const aviso of avisados) console.log(`  ✉ ${aviso}`);
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
