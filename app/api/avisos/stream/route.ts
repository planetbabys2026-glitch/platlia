import { contarCuentasPorCobrar } from "@/features/caja/queries";
import { contarComandasVivas } from "@/features/cocina/queries";
import { contarDomiciliosActivos } from "@/features/domicilios/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireActiveLicense } from "@/lib/auth/dal";
import { leCorresponde, type TipoAviso } from "@/lib/avisos";
import { tienePermisoSeccion, type SeccionPermiso } from "@/lib/auth/permisos-roles";
import { createRedisSubscriber } from "@/lib/redis";
import { currentBusinessDate } from "@/lib/time";

/**
 * El stream que escucha el shell: avisos de pedidos nuevos y contadores del menú.
 *
 * Es el único que se abre desde el layout de `(app)`, así que vive mientras la
 * persona recorre la aplicación y no depende de estar parado en `/cocina` ni en
 * `/domicilios`.
 *
 * Autoriza con `requireActiveLicense()` y no con `requireModule()`: lo pide toda
 * pantalla del producto, y a quien no tenga el módulo de cocina encendido
 * simplemente no se le pinta la insignia. Pedir el módulo acá dejaría sin
 * domicilios a un negocio que apagó la cocina.
 */

export const dynamic = "force-dynamic";

/**
 * Cocina marcando diez renglones listos publica diez veces en menos de un
 * segundo. Sin juntar los eventos, eso son veinte consultas por cada pantalla
 * conectada para llegar al mismo número.
 */
const COALESCENCIA_MS = 400;

/**
 * Se recuenta cada tanto pase lo que pase. Es lo que evita que un mensaje
 * perdido deje la insignia mintiendo hasta que alguien recargue, y es toda la
 * funcionalidad que queda cuando no hay `REDIS_URL` configurada —que es
 * opcional— o cuando Redis se cayó.
 */
const RECONCILIACION_MS = 60_000;

const KEEP_ALIVE_MS = 20_000;

export async function GET(req: Request) {
  try {
    const ctx = await requireActiveLicense();
    const businessId = ctx.business.id;
    const settings = await getSettings(businessId);

    /**
     * Los permisos se leen UNA vez, al conectar.
     *
     * Alcanza: esto decide qué avisos se muestran, no qué pantallas se abren
     * —de eso se encarga el DAL en cada `page.tsx`—, y un cambio de permisos
     * llega en la próxima reconexión. Releerlos en cada mensaje sería una
     * consulta por cada comanda de la noche y por cada pantalla conectada.
     */
    const rol = ctx.role;
    const puedeVer = (seccion: SeccionPermiso) =>
      tienePermisoSeccion(rol, seccion, settings.rolePermissions);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let cerrado = false;

        const enviar = (data: unknown) => {
          if (cerrado) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            cerrado = true;
          }
        };

        const contar = async () => {
          try {
            // La fecha se recalcula en cada vuelta y no se guarda: una pantalla
            // de cocina queda abierta toda la noche y cruza el corte del día de
            // negocio, que no es medianoche sino `businessDayStartMinutes`.
            const businessDate = currentBusinessDate(settings);
            const [cocina, domicilios, caja] = await Promise.all([
              contarComandasVivas(businessId, businessDate),
              contarDomiciliosActivos(businessId),
              contarCuentasPorCobrar(businessId, businessDate),
            ]);
            enviar({ tipo: "contadores", cocina, domicilios, caja });
          } catch {
            // Un recuento que falla no cierra el stream: en la próxima vuelta
            // se vuelve a intentar y la insignia se corrige sola.
          }
        };

        let pendiente: ReturnType<typeof setTimeout> | null = null;
        const contarPronto = () => {
          if (pendiente) return;
          pendiente = setTimeout(() => {
            pendiente = null;
            void contar();
          }, COALESCENCIA_MS);
        };

        await contar();

        const subscriber = createRedisSubscriber();
        const canalAvisos = `avisos:${businessId}`;
        // Estos dos no traen aviso, pero sí mueven los contadores: cocina marca
        // un plato listo, un domicilio sale a reparto. Sin escucharlos la
        // insignia se quedaría alta hasta la reconciliación.
        const canalCocina = `cocina:${businessId}`;
        const canalDomicilios = `domicilios:${businessId}`;

        if (subscriber) {
          void subscriber.subscribe(canalAvisos, canalCocina, canalDomicilios).catch(() => {
            // Sin suscripción queda la reconciliación periódica, que alcanza
            // para los contadores aunque no para los toasts.
          });

          subscriber.on("message", (canal, mensaje) => {
            if (canal === canalAvisos) {
              try {
                const aviso = JSON.parse(mensaje) as { tipo?: TipoAviso };
                // Solo a quien puede atenderlo. Antes iba a todo el que estuviera
                // conectado al negocio, así que el mesero recibía la comanda que
                // él mismo acababa de mandar y el botón "Ver" lo llevaba a una
                // pantalla que su rol no tiene.
                if (aviso?.tipo && leCorresponde(aviso.tipo, puedeVer)) {
                  enviar({ tipo: "aviso", aviso });
                }
              } catch {
                // Mensaje ilegible: el recuento de abajo va igual.
              }
            }
            contarPronto();
          });
        }

        const latido = setInterval(() => {
          if (cerrado) return;
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            cerrado = true;
          }
        }, KEEP_ALIVE_MS);

        const reconciliacion = setInterval(() => {
          void contar();
        }, RECONCILIACION_MS);

        req.signal.addEventListener("abort", () => {
          cerrado = true;
          if (pendiente) clearTimeout(pendiente);
          clearInterval(latido);
          clearInterval(reconciliacion);
          if (subscriber) void subscriber.quit().catch(() => {});
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
        // Sin esto nginx acumula la respuesta y el "tiempo real" llega en
        // tandas de varios segundos.
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response("No autorizado", { status: 401 });
  }
}
