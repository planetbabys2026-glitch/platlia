import { expect, test } from "@playwright/test";

test("la portada carga y ofrece registro e ingreso", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /tu restaurante, ordenado/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /prueba de 7 días/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^ingresar$/i })).toBeVisible();
});

test("el health check reporta la base de datos", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", db: "ok" });
});
