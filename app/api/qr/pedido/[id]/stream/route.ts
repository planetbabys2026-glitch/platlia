// eslint-disable-next-line no-restricted-imports -- Ruta pública: un comensal no tiene sesión ni businessId con el cual acotar. Se resuelve desde el pedido.
import { rootDb } from "@/lib/db/root";
import { createRedisSubscriber } from "@/lib/redis";

/**
 * El rastreo en vivo del comensal.
 *
 * El menú QR ya abría un `EventSource`, pero contra `/api/domicilios/stream`, que
 * exige licencia y sesión: a un comensal le respondía **401**. En la práctica el
 * rastreo solo avanzaba si la persona tocaba "Refrescar estado", así que el paso
 * más importante —"tu pedido salió"— no se veía nunca solo.
 *
 * Esta ruta **no manda datos del pedido**: emite un aviso de "algo cambió" y el
 * cliente vuelve a pedir su estado con `consultarEstadoPedidoQR`, que es la
 * acción pública que ya decide qué se puede contar y qué no. Así no hay dos
 * lugares donde equivocarse sobre qué sale a la calle.
 *
 * Lo único que autoriza es tener el id del pedido, que es un cuid: no se adivina
 * probando, que es exactamente la razón por la que `consultarEstadoPedidoQR` dejó
 * de aceptar el número de pedido.
 */
export const dynamic = "force-dynamic";

const CODIFICADOR = new TextEncoder();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const pedido = await rootDb.order.findUnique({
    where: { id },
    // Solo el negocio al que pertenece: es todo lo que hace falta para saber a
    // qué canal suscribirse, y nada de lo que se emite sale de acá.
    select: { businessId: true },
  });

  if (!pedido) return new Response("No encontrado", { status: 404 });

  const stream = new ReadableStream({
    start(controller) {
      let cerrado = false;
      const enviar = (texto: string) => {
        if (cerrado) return;
        try {
          controller.enqueue(CODIFICADOR.encode(texto));
        } catch {
          cerrado = true;
        }
      };

      const subscriber = createRedisSubscriber();
      const canal = `domicilios:${pedido.businessId}`;

      if (subscriber) {
        void subscriber.subscribe(canal).catch(() => {});
        subscriber.on("message", (ch) => {
          // El canal es del negocio, no del pedido: lo que viaja es un "mirá de
          // nuevo", nunca el contenido del cambio. El comensal solo puede leer
          // el suyo, porque la acción pública lo acota por id.
          if (ch === canal) enviar(`data: {"type":"update"}\n\n`);
        });
      }

      // Sin Redis queda el keep-alive y el botón de refrescar: la misma
      // degradación silenciosa que el resto de los streams del proyecto.
      const ping = setInterval(() => enviar(": ping\n\n"), 15_000);

      const limpiar = () => {
        cerrado = true;
        clearInterval(ping);
        if (subscriber) {
          void subscriber.unsubscribe(canal).catch(() => {});
          subscriber.disconnect();
        }
        try {
          controller.close();
        } catch {
          // Ya estaba cerrado.
        }
      };

      req.signal.addEventListener("abort", limpiar);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffea las respuestas por defecto y un SSE bufeado no llega nunca.
      "X-Accel-Buffering": "no",
    },
  });
}
