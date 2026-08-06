import { requireBusiness } from "@/lib/auth/dal";
import { createRedisSubscriber } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireBusiness();
    const businessId = ctx.business.id;

    const stream = new ReadableStream({
      start(controller) {
        const subscriber = createRedisSubscriber();

        if (!subscriber) {
          const pingInterval = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(": ping\n\n"));
            } catch {
              clearInterval(pingInterval);
            }
          }, 15000);

          return () => clearInterval(pingInterval);
        }

        const channel = `domicilios:${businessId}`;

        void subscriber.subscribe(channel).catch(() => {});

        subscriber.on("message", (ch, message) => {
          if (ch === channel) {
            try {
              controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
            } catch {
              // Cliente desconectado
            }
          }
        });

        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(": ping\n\n"));
          } catch {
            clearInterval(pingInterval);
            void subscriber.unsubscribe(channel).catch(() => {});
            subscriber.disconnect();
          }
        }, 15000);

        req.signal.addEventListener("abort", () => {
          clearInterval(pingInterval);
          void subscriber.unsubscribe(channel).catch(() => {});
          subscriber.disconnect();
          try {
            controller.close();
          } catch {
            // Ya cerrado
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response("No autorizado", { status: 401 });
  }
}
