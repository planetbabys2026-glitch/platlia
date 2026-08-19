import "server-only";
import { Role } from "@/generated/prisma/enums";
// Avisar un fallo exige buscar a quién: las membresías y sus usuarios cruzan negocios por definición.
import { rootDb } from "@/lib/db/root";
import { describirAviso } from "@/lib/avisos";
import { enviarCorreoSinBloquear } from "@/lib/email/enviar";
import { env } from "@/lib/env";
import { publicarAviso } from "@/lib/redis";

/**
 * Cuando un papel no sale, alguien tiene que enterarse.
 *
 * Es la mitad que faltaba de los reintentos: reintentar tres veces y después
 * callarse es peor que no reintentar, porque nadie sabe que la comanda no llegó a
 * la plancha hasta que el cliente pregunta por su comida.
 *
 * Avisa por dos vías a propósito. El toast salta en cualquier pantalla del local
 * y llega a quien está parado ahí en ese momento —es lo que sirve para actuar—;
 * el correo queda para el dueño y para soporte, que quizá no están en el salón.
 *
 * No lanza nunca: se llama desde el camino que atiende al agente, y que el aviso
 * falle no puede hacer que el agente reciba un 500 y reintente el lote entero.
 */
export async function avisarFalloDeImpresion(businessId: string, jobId: string): Promise<void> {
  try {
    const job = await rootDb.printJob.findFirst({
      where: { id: jobId, businessId },
      select: {
        id: true,
        tipo: true,
        ultimoError: true,
        orderId: true,
        order: { select: { code: true } },
        printer: { select: { name: true } },
        business: { select: { name: true } },
      },
    });
    if (!job) return;

    const code = job.order?.code ?? 0;

    void publicarAviso(
      businessId,
      describirAviso({
        tipo: "IMPRESION_FALLIDA",
        orderId: job.orderId ?? job.id,
        code,
        impresora: job.printer.name,
        documento: job.tipo,
        motivo: job.ultimoError,
      }),
    );

    // Al dueño y a los administradores: son quienes pueden ir a mirar la
    // impresora o llamar a alguien. Al cajero ya le saltó el toast.
    const responsables = await rootDb.membership.findMany({
      where: {
        businessId,
        active: true,
        role: { in: [Role.PROPIETARIO, Role.ADMINISTRADOR] },
        user: { deletedAt: null },
      },
      select: { user: { select: { email: true, name: true } } },
    });

    const destinatarios = [
      ...responsables.map((m) => m.user.email),
      ...(env.OPS_ALERT_EMAIL ? [env.OPS_ALERT_EMAIL] : []),
    ];

    const que = job.tipo === "RECIBO" ? "el recibo" : "la comanda";
    const asunto = `No se pudo imprimir ${que} del pedido #${code}`;
    const cuerpo =
      `La impresora "${job.printer.name}" de ${job.business.name} no respondió después de ` +
      `tres intentos.\n\n` +
      `Documento: ${job.tipo}\nPedido: #${code}\n` +
      `Último error: ${job.ultimoError ?? "sin detalle"}\n\n` +
      `Revisá que la impresora esté encendida, con papel y en la misma red que el ` +
      `programa de impresión.`;

    for (const para of new Set(destinatarios)) {
      enviarCorreoSinBloquear({
        para,
        asunto,
        texto: cuerpo,
        html: `<p>${cuerpo.replace(/\n/g, "<br>")}</p>`,
        contexto: `impresion fallida ${job.id}`,
      });
    }
  } catch (error) {
    console.error("[impresion] no se pudo avisar el fallo", error);
  }
}
