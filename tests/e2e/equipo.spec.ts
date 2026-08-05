import { expect, test, type Page } from "@playwright/test";

/**
 * El dueño arma su equipo y cada rol ve solo lo suyo.
 *
 * En serie: se crea un empleado en el primer test y se usa en el segundo.
 */
test.describe.configure({ mode: "serial" });

const DUENO = { email: "dueno@platlia.com", password: "platlia123" };

const sufijo = Date.now().toString(36);
const MESERO = {
  nombre: `Mesero ${sufijo}`,
  email: `mesero-${sufijo}@platlia.test`,
  clave: "contrasenasegura",
};

async function ingresar(page: Page, datos: { email: string; password: string }) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

test("el dueño agrega un mesero, aunque el correo de aviso no salga", async ({ page }) => {
  // El dominio de Resend todavía no está verificado: el aviso falla y se registra
  // en el log. Lo que NO puede pasar es que eso impida dar de alta a la persona.
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  // Acotado al formulario de alta: cada miembro de la lista tiene su propio
  // campo "Contraseña nueva", que también coincide con "Contraseña".
  const alta = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /agregar al equipo/i }) });

  await alta.getByLabel("Nombre").fill(MESERO.nombre);
  await alta.getByLabel("Correo").fill(MESERO.email);
  await alta.getByLabel("Contraseña").fill(MESERO.clave);
  await page.getByRole("button", { name: /agregar al equipo/i }).click();

  await expect(page.getByText(MESERO.email)).toBeVisible();
  await expect(page.getByText(MESERO.nombre)).toBeVisible();
});

test("el mesero entra y no alcanza la administración", async ({ page }) => {
  await ingresar(page, { email: MESERO.email, password: MESERO.clave });

  // Ve el salón, que es su trabajo. Con `level: 1` porque el área del seed
  // también se llama "Salón" y aparece como h2.
  await page.goto("/salon");
  await expect(page.getByRole("heading", { name: "Salón", level: 1 })).toBeVisible();

  // Y no la administración, aunque escriba la URL a mano: requireRole responde
  // 404, sin confirmarle siquiera que la página existe.
  const respuesta = await page.request.get("/administracion/equipo");
  expect(respuesta.status()).toBe(404);
});

test("no se puede dejar al negocio sin propietario", async ({ page }) => {
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  // El propio dueño no aparece con controles: ofrecer un botón que siempre
  // falla es una trampa.
  const suPropiaFila = page.locator("li").filter({ hasText: "(vos)" });
  await expect(suPropiaFila).toHaveCount(1);
  await expect(suPropiaFila.getByRole("button", { name: /dar de baja/i })).toHaveCount(0);

  await expect(page.getByText(/hay un solo propietario/i)).toBeVisible();
});

test("el mesero dado de baja deja de entrar", async ({ page }) => {
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  const fila = page.locator("li").filter({ hasText: MESERO.email });
  await fila.getByRole("button", { name: /dar de baja/i }).click();
  await expect(page.getByRole("heading", { name: "Dados de baja" })).toBeVisible();

  // Su sesión quedó revocada y su membresía inactiva: el DAL lo manda a elegir
  // negocio o a crear uno, pero no lo deja operar el bar.
  await page.context().clearCookies();
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(MESERO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(MESERO.clave);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await expect(page).not.toHaveURL(/\/panel$/);
  const salon = await page.request.get("/salon", { maxRedirects: 0 });
  expect(salon.status()).toBe(307);
});
