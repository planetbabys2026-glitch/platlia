"use client";

import Script from "next/script";

/**
 * El widget de Cloudflare Turnstile.
 *
 * **Solo se dibuja si hay llave pública configurada.** Sin ella no se pinta
 * nada y no se carga ningún script, que es como corren desarrollo y la suite
 * e2e: la verificación del servidor también se saltea sola en ese caso
 * (`lib/seguridad/turnstile.ts`), así que las dos mitades están de acuerdo sin
 * que nadie tenga que acordarse de apagar la otra.
 *
 * No hace falta ninguna dependencia: el widget es un `<script>` de Cloudflare
 * que busca los `div.cf-turnstile` y les inyecta un campo oculto llamado
 * `cf-turnstile-response`, que es lo que viaja con el formulario y lo que el
 * servidor verifica.
 *
 * `strategy="lazyOnload"` a propósito: esto no puede retrasar el pintado de la
 * pantalla de ingreso, que es la primera que ve alguien que llega a trabajar.
 */
export function Turnstile({ className }: { className?: string }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className={`cf-turnstile ${className ?? ""}`}
        // El tema se fija en oscuro porque toda la aplicación lo es: en "auto"
        // el widget sigue al sistema y sale un recuadro blanco sobre la tinta.
        data-theme="dark"
        data-sitekey={siteKey}
      />
    </>
  );
}
