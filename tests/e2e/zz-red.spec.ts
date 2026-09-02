import { expect, test } from "@playwright/test";
import { ingresar } from "./apoyo";

test("diagnóstico de red: qué pasa al abrir la caja", async ({ page }) => {
  test.setTimeout(90_000);

  page.on("request", (r) => {
    if (r.method() === "POST") console.log(`→ POST ${r.url()}`);
  });
  page.on("response", (r) => {
    if (r.request().method() === "POST") console.log(`← ${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => console.log(`✗ FALLÓ ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[navegador] ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => console.log(`[pageerror] ${String(e).slice(0, 200)}`));

  await ingresar(page);
  await page.goto("/caja?vista=movimientos");

  const base = page.getByLabel(/base en efectivo/i);
  await expect(base).toBeVisible();
  await base.fill("0");

  console.log("--- clic en Abrir caja ---");
  await page.getByRole("button", { name: /abrir caja/i }).click();

  await page.waitForTimeout(25_000);
  console.log("--- 25 s después ---");
  console.log("botón:", await page.getByRole("button", { name: /abrir caja|un momento/i }).first().textContent());
  console.log("h1:", await page.getByRole("heading", { level: 1 }).first().textContent());
});
