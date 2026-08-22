import { autenticarAgente } from "@/lib/printing/agente";
import { createRedisSubscriber } from "@/lib/redis";

/**
 * El timbre del agente, por HTTP.
 *
 * Redis es el transporte del lado del servidor —`publicarImpresion` publica en
 * `impresion:<businessId>`— pero el agente corre en la PC de un bar, detrás del
 * router del local. Exponerle Redis a internet sería abrir un puerto más y
 * repartir credenciales de la base de eventos a cada sucursal; en cambio esto
 * viaja por el mismo dominio y el mismo TLS que ya usa todo lo demás.
 *
 * Lo que viaja es un "vení a buscar", nunca el trabajo: la cola vive en Postgres
 * y se retira por `GET /api/impresion/trabajos`. Así, si el stream se cae o el
 * aviso se pierde, el agente encuentra igual lo que quedó pendiente en su próxima
 * ronda —el mismo patrón de snapshot + reconciliación de `avisos/stream`—.
 */
export const dynamic = "force-dynamic";

const CODIFICADOR = new TextEncoder();

export async function GET(req: Request) {
  const agente = await autenticarAgente(req.headers.get("authorization"));
  if (!agente) return new Response("No autorizado", { status: 401 });

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

      // Al conectar: puede haber quedado trabajo de mientras estuvo caído.
      enviar(`data: {"type":"init"}\n\n`);

      const subscriber = createRedisSubscriber();
      const canal = `impresion:${agente.businessId}`;

      if (subscriber) {
        void subscriber.subscribe(canal).catch(() => {});
        subscriber.on("message", (ch) => {
          if (ch === canal) enviar(`data: {"type":"update"}\n\n`);
        });
      }

      // Sin Redis, el agente se entera igual: el ping le sirve de latido y su
      // propio reloj lo manda a buscar cada tanto.
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
      "X-Accel-Buffering": "no",
    },
  });
}
