/**
 * Revisa las pantallas contra la matriz de viewports del handoff.
 *
 * No es una prueba de la suite e2e: no afirma comportamiento, mide geometría.
 * Contesta las dos preguntas que no se pueden responder mirando el código —si algo
 * desborda a lo ancho y si algún control quedó por debajo del mínimo táctil— en los
 * nueve tamaños en los que el diseño tiene que funcionar.
 *
 *   pnpm tsx --env-file=.env scripts/revisar-viewports.ts [--url http://127.0.0.1:3211]
 *
 * Deja las capturas en `.playwright/viewports/` para mirarlas después.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { CLAVE_SEMILLA } from "@/prisma/datos-semilla";

const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://127.0.0.1:3211";

const CAPTURAS = process.argv.includes("--capturas");

const VIEWPORTS = [
  { nombre: "movil-compacto", width: 360, height: 800 },
  { nombre: "movil-estandar", width: 390, height: 844 },
  { nombre: "movil-grande", width: 430, height: 932 },
  { nombre: "plegable", width: 600, height: 960 },
  { nombre: "tablet-vertical", width: 820, height: 1180 },
  { nombre: "tablet-horizontal", width: 1024, height: 768 },
  { nombre: "laptop", width: 1366, height: 768 },
  { nombre: "escritorio", width: 1440, height: 900 },
  { nombre: "escritorio-ancho", width: 1920, height: 1080 },
];

const RUTAS = [
  "/panel",
  "/salon",
  "/pos",
  "/cocina",
  "/caja",
  "/domicilios",
  "/informes",
  "/inventario",
  "/administracion/carta",
  "/administracion/equipo",
  "/administracion/configuracion",
];

const CREDENCIALES = { email: "dueno@platlia.com", password: CLAVE_SEMILLA };

/** El mínimo táctil del manual. Abajo de esto, el dedo falla. */
const MINIMO_TACTIL = 44;

async function ingresar(page: Page) {
  await page.goto(`${BASE}/ingresar`);
  await page.getByLabel("Correo").fill(CREDENCIALES.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(CREDENCIALES.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/(panel|pos|salon)$/, { timeout: 20_000 });
}

async function main() {
  const navegador = await chromium.launch({ channel: "chrome" });
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();

  await ingresar(page);

  if (CAPTURAS) mkdirSync(".playwright/viewports", { recursive: true });

  const desbordes: string[] = [];
  const chicos: string[] = [];

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const ruta of RUTAS) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" }).catch(() => {});

      // ¿Desborda a lo ancho? Se mide contra el viewport, no contra el body:
      // un hijo con `position: fixed` también empuja la barra horizontal.
      const desborde = await page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth - d.clientWidth;
      });
      if (desborde > 1) {
        desbordes.push(`${vp.nombre} (${vp.width}px) · ${ruta} · +${desborde}px`);
      }

      // ¿Algún control por debajo del mínimo táctil? Solo importa donde se toca.
      if (vp.width < 1020) {
        const pequenos = await page.evaluate((minimo) => {
          // Las mismas exclusiones que la regla de `globals.css`, para que la
          // medición y lo que el sistema promete digan lo mismo. Casillas y radios
          // quedan afuera a propósito: miden 16px, pero el destino del dedo es su
          // `<label>` asociado, que es grande.
          const seleccion =
            "button, a[href], input:not([type=checkbox]):not([type=radio]):not([type=hidden])," +
            " select, textarea, [role=button], [role=tab]";
          const malos: string[] = [];
          for (const el of Array.from(document.querySelectorAll(seleccion))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue; // oculto
            const estilo = getComputedStyle(el);
            if (estilo.visibility === "hidden" || estilo.display === "none") continue;
            // Lo que solo existe para el lector de pantalla no se toca: el `input
            // type=file` de la carta, por ejemplo, lo dispara un botón visible.
            if (el.classList.contains("sr-only")) continue;
            if (r.height < minimo) {
              const etiqueta = (el.textContent || el.getAttribute("aria-label") || el.tagName)
                .trim()
                .slice(0, 40);
              malos.push(`${Math.round(r.height)}px · ${etiqueta}`);
            }
          }
          return Array.from(new Set(malos)).slice(0, 6);
        }, MINIMO_TACTIL);

        for (const p of pequenos) chicos.push(`${vp.nombre} · ${ruta} · ${p}`);
      }

      if (CAPTURAS) {
        const archivo = ruta.replace(/\//g, "_") || "_raiz";
        await page.screenshot({
          path: `.playwright/viewports/${vp.nombre}${archivo}.png`,
          fullPage: false,
        });
      }
    }
  }

  await navegador.close();

  console.log("\n══ DESBORDE HORIZONTAL ══");
  console.log(desbordes.length ? desbordes.join("\n") : "ninguno ✓");

  console.log(`\n══ CONTROLES BAJO ${MINIMO_TACTIL}px (solo <1020px) ══`);
  console.log(chicos.length ? chicos.slice(0, 60).join("\n") : "ninguno ✓");
  if (chicos.length > 60) console.log(`… y ${chicos.length - 60} más`);

  process.exit(desbordes.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
