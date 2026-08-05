import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

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
  webServer: {
    command: "pnpm build && pnpm start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
