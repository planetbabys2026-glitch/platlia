import { requireActiveLicense } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { getSettings } from "@/features/negocio/queries";
import { createRedisSubscriber } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * El canal en vivo de la caja.
 *
 * Desde que la caja lista todo lo que salió a cocina, es un tablero que cambia
 * solo mientras el cajero está parado adelante: entra una comanda, la mesa 4
 * pide la cuenta, la cocina termina un plato. Recargar para enterarse es un
 * cliente esperando en el mostrador.
 *
 * **Pide el permiso de caja, no solo la licencia.** El canal de domicilios se
 * conforma con `requireActiveLicense`, y esa es justamente la clase de olvido que
 * ya se corrigió en el canal de avisos: un canal por negocio le manda lo que pasa
 * adentro a cualquiera que se conecte. Acá lo que viaja es cuándo mirar, no qué
 * cobró nadie, pero el criterio es el mismo —si no podés entrar a la pantalla,
 * tampoco tenés por qué enterarte de lo que pasa en ella—.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireActiveLicense();
    const settings = await getSettings(ctx.business.id);
    if (!tienePermisoSeccion(ctx.role, "caja", settings.rolePermissions)) {
      return new Response("No autorizado", { status: 403 });
    }

    const businessId = ctx.business.id;

    const stream = new ReadableStream({
      start(controller) {
        const subscriber = createRedisSubscriber();
        const codificador = new TextEncoder();

        // El ping mantiene viva la conexión a través de proxies que cortan lo
        // ocioso, y es lo único que hay cuando Redis no está configurado: la
        // pantalla se queda quieta, pero no se rompe.
        const latir = (limpiar?: () => void) =>
          setInterval(() => {
            try {
              controller.enqueue(codificador.encode(": ping\n\n"));
            } catch {
              limpiar?.();
            }
          }, 15_000);

        if (!subscriber) {
          const ping = latir(() => clearInterval(ping));
          req.signal.addEventListener("abort", () => clearInterval(ping));
          return;
        }

        const canal = `caja:${businessId}`;
        void subscriber.subscribe(canal).catch(() => {});

        subscriber.on("message", (ch, mensaje) => {
          if (ch !== canal) return;
          try {
            controller.enqueue(codificador.encode(`data: ${mensaje}\n\n`));
          } catch {
            // Cliente desconectado.
          }
        });

        const cerrar = () => {
          void subscriber.unsubscribe(canal).catch(() => {});
          subscriber.disconnect();
        };

        const ping = latir(() => {
          clearInterval(ping);
          cerrar();
        });

        req.signal.addEventListener("abort", () => {
          clearInterval(ping);
          cerrar();
          try {
            controller.close();
          } catch {
            // Ya cerrado.
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
