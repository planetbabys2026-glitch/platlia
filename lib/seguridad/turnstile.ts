import { env } from "@/lib/env";

/**
 * Verificación de Cloudflare Turnstile.
 *
 * Se eligió Turnstile y no reCAPTCHA porque el sitio ya está detrás de
 * Cloudflare —el `robots.txt` en vivo lo sirve su capa gestionada—, así que no
 * suma un tercero nuevo, no cobra y no pide resolver semáforos. Y no hace falta
 * ninguna dependencia: el widget es una etiqueta `<script>` y la verificación es
 * un POST.
 *
 * **Está apagado mientras no haya llave.** `TURNSTILE_SECRET_KEY` es opcional
 * por lo mismo que las variables de verificación de buscadores: `next build`
 * importa `lib/env.ts` al recolectar las rutas, así que una obligatoria sería un
 * despliegue que no arranca. Sin llave la verificación deja pasar y quedan las
 * otras dos capas —la trampa y el freno por procedencia—, que es lo que permite
 * que desarrollo y la suite e2e corran sin configurar nada.
 *
 * Configurado, en cambio, un token que no verifica **rechaza**. Es el único
 * lugar donde "sin configurar" y "mal configurado" tienen que comportarse
 * distinto: si un token inválido pasara, la protección no existiría en
 * producción y nadie se enteraría.
 */

const VERIFICAR_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** El nombre del campo lo fija Turnstile: es el que inyecta su widget. */
export const CAMPO_TURNSTILE = "cf-turnstile-response";

/** Si no hay llave, la protección no está configurada y no se exige. */
export function turnstileConfigurado(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

export async function verificarTurnstile(token: string | undefined): Promise<boolean> {
  const secreto = env.TURNSTILE_SECRET_KEY;
  if (!secreto) return true;

  if (!token) return false;

  try {
    const cuerpo = new FormData();
    cuerpo.append("secret", secreto);
    cuerpo.append("response", token);

    const respuesta = await fetch(VERIFICAR_URL, { method: "POST", body: cuerpo });
    if (!respuesta.ok) return false;

    const datos = (await respuesta.json()) as { success?: boolean };
    return datos.success === true;
  } catch (error) {
    // Cloudflare caído no puede dejar a nadie afuera del producto: quien está
    // del otro lado es un cliente que quiere entrar a trabajar, y el freno por
    // procedencia sigue puesto debajo. Es el mismo criterio que
    // `enviarCorreoSinBloquear`: se registra y se sigue.
    console.error("[turnstile] no se pudo verificar", error);
    return true;
  }
}
