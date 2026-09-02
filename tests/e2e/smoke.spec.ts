import { expect, test } from "@playwright/test";

test("la portada carga y ofrece registro e ingreso", async ({ page }) => {
  await page.goto("/");

  // Contra el arranque de la frase y no contra toda: el titular es copia de
  // marketing y cambia; lo que la prueba viene a comprobar es que la portada
  // pinta su encabezado y ofrece las dos puertas, no cuál es el eslogan de este
  // trimestre. Antes afirmaba "Tu restaurante, ordenado", que dejó de existir
  // hace commits y tenía la suite en rojo desde entonces.
  await expect(page.getByRole("heading", { name: /cada segundo optimizado/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /empezar prueba gratis/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^ingresar$/i })).toBeVisible();
});

test("el health check reporta la base de datos", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", db: "ok" });
});
