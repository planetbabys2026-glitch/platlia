import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
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
