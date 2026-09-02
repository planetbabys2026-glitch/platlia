import { expect, test } from "@playwright/test";
import { ingresar } from "./apoyo";

/** ¿El aborto del POST le pasa también a una acción que no tocamos? */
test("diagnóstico: abrir un pedido en el salón", async ({ page }) => {
  test.setTimeout(90_000);

  const eventos: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") eventos.push(`→ POST ${new URL(r.url()).pathname}`); });
  page.on("response", (r) => { if (r.request().method() === "POST") eventos.push(`← ${r.status()} ${new URL(r.url()).pathname}`); });
  page.on("requestfailed", (r) => { if (r.method() === "POST") eventos.push(`✗ ABORTADO ${new URL(r.url()).pathname} :: ${r.failure()?.errorText}`); });

  await ingresar(page);
  await page.goto("/salon");

  // `abrirPedido` no se tocó en este trabajo.
  const boton = page.getByRole("button", { name: /abrir pedido en la mesa 9$/i });
  await expect(boton).toBeVisible({ timeout: 20_000 });
  eventos.push("--- clic en abrir pedido ---");
  await boton.click();

  await page.waitForTimeout(20_000);
  eventos.push(`URL final: ${new URL(page.url()).pathname}`);
  console.log("TRAZA\n" + eventos.join("\n"));
});
