import { getSettings } from "@/features/negocio/queries";
import { getTurnero } from "@/features/turnero/queries";
import { requireModule } from "@/lib/auth/dal";
import { createRedisSubscriber } from "@/lib/redis";
import { currentBusinessDate } from "@/lib/time";
import { AppModule } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireModule(AppModule.PEDIDOS);
    const settings = await getSettings(ctx.business.id);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream ya cerrado por el cliente
          }
        };

        const sendPing = () => {
          try {
            controller.enqueue(encoder.encode(`: keep-alive\n\n`));
          } catch {
            // Stream cerrado
          }
        };

        // 1. Enviar datos iniciales al conectar
        try {
          const { listos } = await getTurnero(
            ctx.business.id,
            currentBusinessDate(settings),
          );
          sendEvent({ type: "init", listos });
        } catch {
          // Ignorar fallos en la consulta inicial
        }

        // 2. Suscribirse a canal Redis Pub/Sub
        const subscriber = createRedisSubscriber();
        const channel = `turnero:${ctx.business.id}`;

        if (subscriber) {
          subscriber.subscribe(channel, (err) => {
            if (err) {
              // Si falla suscripción Redis, SSE funcionará con keep-alive / fallback cliente
            }
          });

          subscriber.on("message", async (chan) => {
            if (chan === channel) {
              try {
                const fresh = await getTurnero(
                  ctx.business.id,
                  currentBusinessDate(settings),
                );
                sendEvent({ type: "update", listos: fresh.listos });
              } catch {
                // Ignorar error al refrescar
              }
            }
          });
        }

        // 3. Ping keep-alive cada 20 segundos
        const pingInterval = setInterval(() => {
          sendPing();
        }, 20000);

        // 4. Limpieza al desconectar el cliente
        req.signal.addEventListener("abort", () => {
          clearInterval(pingInterval);
          if (subscriber) {
            void subscriber.quit().catch(() => {});
          }
          try {
            controller.close();
          } catch {
            // Controlador ya cerrado
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response("No autorizado", { status: 401 });
  }
}
