import { expect, test, type Page } from "@playwright/test";
import { PANTALLA_DE_ENTRADA } from "./apoyo";

/**
 * Superadministración.
 *
 * Lo que se prueba es la frontera: que la sesión del producto NO abra la consola
 * de soporte por más que el usuario tenga la marca de superadministrador. Son dos
 * puertas distintas a propósito, con cookies distintas.
 */

const SUPER = { email: "super@platlia.com", password: "platlia123" };
const DUENO = { email: "dueno@platlia.com", password: "platlia123" };

async function ingresarApp(page: Page, datos: { email: string; password: string }) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
}

test("sin cookie de soporte, /superadmin manda a su propio ingreso y no hace bucle", async ({
  page,
}) => {
  // El bucle era real: /superadmin/ingresar no estaba en la lista pública del
  // middleware y se redirigía a sí misma para siempre.
  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/superadmin\/ingresar$/);
  await expect(page.getByRole("heading", { name: "Superadministración" })).toBeVisible();
});

test("la sesión del producto no abre la consola de soporte", async ({ page }) => {
  // El dueño de un bar tiene sesión válida en la aplicación...
  await ingresarApp(page, DUENO);
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  // ...y aun así la consola le pide su propia puerta.
  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/superadmin\/ingresar$/);
});

test("ni siquiera el superadministrador entra con la cookie de la aplicación", async ({
  page,
}) => {
  // super@platlia.com tiene isSuperAdmin, pero entrar por /ingresar crea una
  // sesión de tipo APP: quien da soporte entra a propósito, no por arrastre.
  await ingresarApp(page, SUPER);

  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/superadmin\/ingresar$/);
});

test("el superadministrador entra por su puerta y ve los negocios", async ({ page }) => {
  await page.goto("/superadmin/ingresar");
  await page.getByLabel("Correo").fill(SUPER.email);
  await page.getByLabel("Contraseña").fill(SUPER.password);
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).toHaveURL(/\/superadmin$/);
  // level:1: "Negocios" es el h1 de la página Y el h2 de la tarjeta con la
  // lista, dentro de esa misma página.
  await expect(page.getByRole("heading", { name: "Negocios", level: 1 })).toBeVisible();
  await expect(page.getByText("Bar Demo").first()).toBeVisible();
});

test("un correo que no es superadministrador recibe el mismo mensaje", async ({ page }) => {
  // No se puede averiguar quién tiene la marca desde este formulario.
  await page.goto("/superadmin/ingresar");
  await page.getByLabel("Correo").fill(DUENO.email);
  await page.getByLabel("Contraseña").fill(DUENO.password);
  await page.getByRole("button", { name: /entrar/i }).click();

  const alerta = page.locator("form").getByRole("alert");
  await expect(alerta).toHaveText("Credenciales incorrectas.");

  await page.getByLabel("Correo").fill("nadie-existe@platlia.test");
  await page.getByLabel("Contraseña").fill("loquesea12345");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(alerta).toHaveText("Credenciales incorrectas.");
});

test("el bootstrap avisa que reemplaza al superadministrador que ya existe", async ({ page }) => {
  // La puerta ya no se cierra sola al existir uno: cerrarse era justamente lo
  // que impedía recuperar el acceso cuando nadie podía entrar. Lo que sí tiene
  // que hacer es decir en la cara que reemplaza, porque el seed ya creó
  // super@platlia.com y quien llegue acá va a dejarlo afuera.
  await page.goto("/pl-bootstrap");

  await expect(page.getByRole("heading", { name: /rehacer el superadministrador/i })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/pierde el acceso/i);
});
