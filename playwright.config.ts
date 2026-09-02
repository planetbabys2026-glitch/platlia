import { defineConfig, devices } from "@playwright/test";
import { exigirBaseBorrable } from "./lib/db/base-local";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Los e2e ESCRIBEN en la base: abren turnos, cobran cuentas y `auth.spec.ts`
 * llega a crear negocios y usuarios que nadie borra después. Corrida contra la
 * base de producción, la suite le mete datos de prueba a un negocio real.
 *
 * Se carga el `.env` a mano porque acá no hay Next que lo haga, y se aplica la
 * misma guarda que el seed: si la base no es de esta máquina, no se corre.
 */
process.loadEnvFile?.(".env");
exigirBaseBorrable(process.env.DATABASE_URL ?? "", "La suite e2e");

export default defineConfig({
  testDir: "./tests/e2e",

  // En serie y con un solo worker, a propósito. Los e2e corren contra UNA base
  // compartida cuyo estado clave es singleton: hay una sola caja abierta por
  // empresa. Dos archivos en paralelo se la pisan y fallan de a ratos, que es
  // peor que tardar un minuto más.
  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",

  // Los 30 s por defecto no alcanzan y el fallo que producen no se parece a la
  // causa: estas pruebas recorren turnos enteros contra un build de producción y
  // una base real, y los ganchos —que dejan la caja cerrada resolviendo lo que
  // haya quedado abierto— gastan buena parte del presupuesto antes de que la
  // prueba empiece. `test.setTimeout()` adentro del test no cubre al `beforeEach`,
  // así que tiene que estar acá.
  timeout: 120_000,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },

  // `channel: "chrome"` usa el Chrome instalado en la máquina en vez del
  // Chromium propio de Playwright: evita bajar 130 MB por equipo y por CI, y de
  // paso se prueba contra el navegador que la gente realmente tiene.
  projects: [
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],

  // Los e2e corren contra un build de producción: `next dev` tiene tiempos y
  // comportamientos distintos que producen falsos positivos.
  //
  // `start:standalone` y NO `start`: `next.config.ts` usa `output: "standalone"`,
  // y el propio Next avisa por consola que con esa salida `next start` no es el
  // arranque correcto. Es además el mismo comando que usa el despliegue, así que
  // los e2e prueban contra el servidor que de verdad va a correr.
  webServer: {
    command: "pnpm build && pnpm start:standalone",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
