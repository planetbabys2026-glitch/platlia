import { getComandas } from "@/features/cocina/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { createRedisSubscriber } from "@/lib/redis";
import { currentBusinessDate } from "@/lib/time";
import { AppModule } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireModule(AppModule.COCINA);
    const settings = await getSettings(ctx.business.id);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream cerrado por cliente
          }
        };

        const sendPing = () => {
          try {
            controller.enqueue(encoder.encode(`: keep-alive\n\n`));
          } catch {
            // Stream cerrado
          }
        };

        // 1. Enviar comandas iniciales al conectar
        try {
          const businessDate = currentBusinessDate(settings);
          const estaciones = await getComandas(ctx.business.id, businessDate);
          sendEvent({ type: "init", estaciones });
        } catch {
          // Ignorar fallos de consulta inicial
        }

        // 2. Suscribirse al canal Redis de Cocina
        const subscriber = createRedisSubscriber();
        const channel = `cocina:${ctx.business.id}`;

        if (subscriber) {
          subscriber.subscribe(channel, (err) => {
            if (err) {
              // Si falla suscripción Redis, fallback a refresco de cliente
            }
          });

          subscriber.on("message", async (chan) => {
            if (chan === channel) {
              try {
                const businessDate = currentBusinessDate(settings);
                const estaciones = await getComandas(ctx.business.id, businessDate);
                sendEvent({ type: "update", estaciones });
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

        // 4. Limpieza al desconectar
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
