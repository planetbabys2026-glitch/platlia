import "server-only";
import { after } from "next/server";
import { enviarCorreoSinBloquear } from "@/lib/email/enviar";

/**
 * Manda un correo DESPUÉS de contestarle a quien está esperando.
 *
 * `enviarCorreoSinBloquear` cumple con que un correo nunca tumbe una operación
 * —registra el fallo y sigue—, pero se sigue esperando: la acción no contesta
 * hasta que Resend conteste. O sea que el correo no la rompe, pero sí la hace
 * tan lenta como el proveedor esté ese día. Medido acá: ~430 ms de ida y vuelta
 * sobre un alta que en base tarda 62 ms, y ese es el buen día.
 *
 * Quien da de alta a un cajero mira un botón en "…" mientras tanto, sin ninguna
 * razón: el aviso de bienvenida no cambia en nada lo que ya quedó escrito.
 *
 * `after()` corre el trabajo una vez enviada la respuesta, así que la pantalla
 * vuelve enseguida y el correo sale igual. Es la razón por la que existe esa API.
 *
 * **Solo desde una petición** (Server Action, route handler). El cron es Node
 * plano y no tiene contexto de petición: ahí va `enviarCorreoSinBloquear`
 * directo, que es por lo que este helper vive aparte y aquel módulo no importa
 * `next/server`.
 */
export function enviarCorreoDespues(
  args: Parameters<typeof enviarCorreoSinBloquear>[0],
): void {
  after(async () => {
    await enviarCorreoSinBloquear(args);
  });
}
