import { expect, test, type Page } from "@playwright/test";
import { CLAVE_SEMILLA } from "@/prisma/datos-semilla";
import { CLAVE_DE_PRUEBA, OTRA_CLAVE_DE_PRUEBA } from "./apoyo";

/**
 * El equipo de superadministración: agregar, editar, restablecer contraseña y
 * quitar acceso.
 *
 * En serie: se crea una persona en el primer test y se usa en los siguientes.
 * Necesita un superadministrador ya sembrado (`super@platlia.com`, el que deja
 * `pnpm seed`) para entrar.
 */
test.describe.configure({ mode: "serial" });

const SUPER = { email: "super@platlia.com", password: CLAVE_SEMILLA };

const sufijo = Date.now().toString(36);
const NUEVO = {
  nombre: `Julián Prueba ${sufijo}`,
  email: `sa-${sufijo}@platlia.test`,
  clave: CLAVE_DE_PRUEBA,
};

async function ingresar(page: Page) {
  await page.goto("/superadmin/ingresar");
  await page.getByLabel("Correo").fill(SUPER.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(SUPER.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/superadmin$/);
}

test("se agrega a alguien al equipo y aparece en la lista", async ({ page }) => {
  await ingresar(page);
  await page.goto("/superadmin/equipo");
  await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();

  await page.getByLabel("Nombre").fill(NUEVO.nombre);
  await page.getByLabel("Correo").fill(NUEVO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(NUEVO.clave);
  await page.getByRole("button", { name: /agregar al equipo/i }).click();

  await expect(page.getByText(NUEVO.email)).toBeVisible();
  await expect(page.getByText(NUEVO.nombre)).toBeVisible();
});

test("esa persona entra por su propia cuenta a la consola", async ({ page }) => {
  await page.goto("/superadmin/ingresar");
  await page.getByLabel("Correo").fill(NUEVO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(NUEVO.clave);
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).toHaveURL(/\/superadmin$/);
});

test("se le edita el correo y el cambio se ve en la lista", async ({ page }) => {
  await ingresar(page);
  await page.goto("/superadmin/equipo");

  const fila = page.locator("li").filter({ hasText: NUEVO.nombre });
  await fila.getByRole("button", { name: "Editar" }).click();

  const correoNuevo = `editado-${sufijo}@platlia.test`;
  const formEdicion = page.locator("form").filter({ has: page.getByRole("button", { name: "Guardar" }) });
  await formEdicion.getByLabel("Correo").fill(correoNuevo);
  await formEdicion.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText(correoNuevo)).toBeVisible();
  NUEVO.email = correoNuevo;
});

test("se le restablece la contraseña y entra con la nueva", async ({ page }) => {
  await ingresar(page);
  await page.goto("/superadmin/equipo");

  const claveNueva = OTRA_CLAVE_DE_PRUEBA;
  const fila = page.locator("li").filter({ hasText: NUEVO.nombre });
  await fila.getByLabel("Contraseña nueva").fill(claveNueva);
  await fila.getByRole("button", { name: /restablecer/i }).click();
  await expect(fila.getByText(/sesiones abiertas/i)).toBeVisible();

  // Sin esto, /superadmin/ingresar rebota a /superadmin porque ya hay una
  // cookie de SUPER válida: el formulario nunca llega a mostrarse.
  await page.context().clearCookies();
  await page.goto("/superadmin/ingresar");
  await page.getByLabel("Correo").fill(NUEVO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(claveNueva);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/superadmin$/);
});

test("no se puede quitar el propio acceso ni el de uno mismo aparece con controles", async ({
  page,
}) => {
  await ingresar(page);
  await page.goto("/superadmin/equipo");

  // La fila de "vos" (el superadministrador sembrado) no ofrece "Quitar acceso":
  // las reglas lo rechazarían igual, pero un botón que siempre falla es una trampa.
  const filaPropia = page.locator("li").filter({ hasText: SUPER.email });
  await expect(filaPropia.getByRole("button", { name: /quitar acceso/i })).toHaveCount(0);
});

test("se le quita el acceso y ya no puede entrar a la consola", async ({ page }) => {
  await ingresar(page);
  await page.goto("/superadmin/equipo");

  const fila = page.locator("li").filter({ hasText: NUEVO.nombre });
  await fila.getByRole("button", { name: /quitar acceso/i }).click();
  await expect(page.getByText(NUEVO.nombre)).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto("/superadmin/ingresar");
  await page.getByLabel("Correo").fill(NUEVO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(OTRA_CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/superadmin\/ingresar$/);
});
