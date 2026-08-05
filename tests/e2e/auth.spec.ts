import { expect, test } from "@playwright/test";

/**
 * Flujo de autenticación contra la base sembrada (`pnpm seed`).
 *
 * Lo que se prueba acá no es la interfaz sino la frontera: que una URL de la
 * aplicación no se pueda ver sin sesión, que el error de credenciales no revele
 * si el correo existe, y que al salir la sesión quede efectivamente cerrada.
 */

const DUENO = { email: "dueno@platlia.com", password: "platlia123" };

async function ingresar(page: import("@playwright/test").Page, datos = DUENO) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
}

test("sin sesión, una ruta de la aplicación manda al ingreso y recuerda a dónde iba", async ({
  page,
}) => {
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/ingresar\?desde=%2Fpanel/);
  await expect(page.getByRole("heading", { name: /ingresá a tu negocio/i })).toBeVisible();
});

test("credenciales incorrectas no delatan si el correo existe", async ({ page }) => {
  // El mismo texto exacto para "esa cuenta no existe" y para "la contraseña está
  // mal". Si fueran distintos, cualquiera podría averiguar quién tiene cuenta.
  for (const datos of [
    { email: DUENO.email, password: "estanoeslacontrasena" },
    { email: "nadie-con-esta-cuenta@platlia.com", password: "estanoeslacontrasena" },
  ]) {
    await ingresar(page, datos);
    // Acotado al formulario: Next inyecta su propio `role="alert"` vacío para
    // anunciar los cambios de ruta, y un getByRole suelto lo agarra a él.
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "Correo o contraseña incorrectos.",
    );
  }
});

test("el propietario entra y el panel muestra su negocio", async ({ page }) => {
  await ingresar(page);

  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { name: "Bar Demo" })).toBeVisible();
  await expect(page.getByText(/jornada del \d{4}-\d{2}-\d{2}/i)).toBeVisible();

  // Los números vienen del seed: 22 mesas en 3 áreas y 17 productos.
  await expect(page.getByText("Mesas").locator("..")).toContainText("22");
  await expect(page.getByText("Productos en carta").locator("..")).toContainText("17");
});

test("volver a /ingresar con sesión abierta lleva al panel", async ({ page }) => {
  await ingresar(page);
  await expect(page).toHaveURL(/\/panel$/);

  await page.goto("/ingresar");
  await expect(page).toHaveURL(/\/panel$/);
});

test("al salir, la sesión queda cerrada de verdad", async ({ page }) => {
  await ingresar(page);
  await page.getByRole("button", { name: /salir/i }).click();
  await expect(page).toHaveURL(/\/ingresar/);

  // No alcanza con que redirija: la cookie ya no puede servir para volver.
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/ingresar/);
});

// OJO: esta prueba deja un negocio y un usuario nuevos en la base de desarrollo,
// y `pnpm seed` no los borra. Se reconocen por el slug `bar-de-prueba-*` y el
// correo `@platlia.test`.
test("el registro crea negocio, licencia de prueba y deja adentro", async ({ page }) => {
  const sufijo = Date.now().toString(36);

  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Prueba Automática");
  await page.getByLabel("Nombre del negocio").fill(`Bar de Prueba ${sufijo}`);
  await page.getByLabel("Correo").fill(`prueba-${sufijo}@platlia.test`);
  await page.getByLabel("Contraseña", { exact: true }).fill("contrasenasegura");
  await page.getByLabel("Repetir contraseña").fill("contrasenasegura");
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();

  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { name: `Bar de Prueba ${sufijo}` })).toBeVisible();

  // Negocio nuevo: sin mesas ni productos, y con la caja cerrada. Los
  // indicadores se buscan por su tarjeta y no por texto suelto: "Caja" también
  // es un enlace de la barra superior.
  await expect(page.getByText("Mesas").locator("..")).toContainText("0");
  await expect(page.getByText("Sin turno abierto").locator("..")).toContainText("Cerrada");
});
