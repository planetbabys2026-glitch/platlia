import { CLAVE_DE_PRUEBA, PANTALLA_DE_ENTRADA } from "./apoyo";
import { expect, test } from "@playwright/test";
import { CLAVE_SEMILLA } from "@/prisma/datos-semilla";

/**
 * Flujo de autenticación contra la base sembrada (`pnpm seed`).
 *
 * Lo que se prueba acá no es la interfaz sino la frontera: que una URL de la
 * aplicación no se pueda ver sin sesión, que el error de credenciales no revele
 * si el correo existe, y que al salir la sesión quede efectivamente cerrada.
 */

const DUENO = { email: "dueno@platlia.com", password: CLAVE_SEMILLA };

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
  await expect(page.getByRole("heading", { name: /entrar al piso/i })).toBeVisible();
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

test("entrar deja a cada quien en su pantalla de trabajo, no en un panel", async ({ page }) => {
  // El panel de indicadores se fue: quien entra a las siete de la tarde va a
  // atender, y tenía que cerrar una pantalla de paso antes de empezar. `/panel`
  // quedó como repartidor —cocina al monitor, el resto al salón o al POS—.
  await ingresar(page);

  await expect(page).toHaveURL(/\/salon$/);
  await expect(page.getByRole("heading", { name: "Salón en Vivo", level: 1 })).toBeVisible();
});

test("volver a /ingresar con sesión abierta devuelve al trabajo", async ({ page }) => {
  await ingresar(page);
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  await page.goto("/ingresar");
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);
});

test("al salir, la sesión queda cerrada de verdad", async ({ page }) => {
  await ingresar(page);

  // "Cerrar sesión" vive dentro del menú de la cuenta, que hay que abrir. Antes
  // estaba suelto al pie de la barra y esta prueba lo clickeaba directo; cuando
  // el pie se reunió en un solo objeto flotante, el clic se quedó esperando los
  // dos minutos del presupuesto a un botón que existe pero no está desplegado.
  await page.getByRole("button", { name: /^cuenta de/i }).click();
  await page.getByRole("button", { name: /cerrar sesión/i }).click();
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
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill(CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();

  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  /**
   * Se comprueba que el negocio nuevo aterriza VACÍO, no los indicadores.
   *
   * Esto afirmaba un encabezado con el nombre del negocio y las tarjetas "Mesas"
   * y "Sin turno abierto": eran del panel de indicadores, que se eliminó —quien
   * entra a las siete de la tarde va a atender, y tenía que cerrar una pantalla
   * de paso antes de empezar—. `/panel` quedó como repartidor y manda al salón.
   */
  await expect(
    page.getByText(/todavía no tiene áreas ni mesas configuradas/i),
  ).toBeVisible();
});

/**
 * Registrarse con un correo que ya existe.
 *
 * Cierra un agujero concreto: cuando el correo existía pero no tenía membresías
 * activas —un empleado dado de baja, un registro abandonado—, `registrarse`
 * adoptaba esa cuenta y abría sesión SIN verificar la contraseña tecleada.
 * Conocer el correo de alguien alcanzaba para entrar como esa persona.
 *
 * Lo que se afirma es lo que de verdad importa: que **no quede sesión abierta**.
 * Afirmar solo el mensaje habría pasado igual el día del defecto, porque el
 * problema no era lo que decía la pantalla sino a dónde te dejaba.
 */
test("registrarse con un correo que ya existe avisa y NO deja entrar", async ({ page }) => {
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Suplantador");
  await page.getByLabel("Nombre del negocio").fill("Bar Ajeno");
  await page.getByLabel("Correo").fill(DUENO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill(CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();

  // Acotado al formulario: un `getByRole("alert")` suelto agarra el anunciador
  // de rutas que Next inyecta vacío (`#__next-route-announcer__`).
  const alerta = page
    .locator("form")
    .filter({ has: page.getByLabel("Tu nombre") })
    .getByRole("alert");
  await expect(alerta).toContainText(/ya tiene una cuenta/i);

  // Y no se dice de qué negocio es: antes el mensaje nombraba la empresa, o sea
  // que probando correos cualquiera averiguaba quién trabaja dónde.
  await expect(alerta).not.toContainText(/bar demo/i);

  // Los dos caminos que sí sirven quedan a la vista.
  await expect(alerta.getByRole("link", { name: /ingresar/i })).toBeVisible();
  await expect(alerta.getByRole("link", { name: /recuperar/i })).toBeVisible();

  // Lo que de verdad se está probando: sigue sin haber sesión.
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/ingresar/);
});

/**
 * La contraseña nueva se exige de verdad, y la pantalla dice qué le falta.
 *
 * El servidor la valida igual —el esquema corre ahí—, pero sin la lista en vivo
 * quien elige una contraseña se entera de los requisitos recién al enviar, de a
 * uno por vez.
 */
test("el registro pide una contraseña que cumpla, y muestra qué falta", async ({ page }) => {
  const sufijo = Date.now().toString(36);

  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Prueba Débil");
  await page.getByLabel("Nombre del negocio").fill(`Bar Débil ${sufijo}`);
  await page.getByLabel("Correo").fill(`debil-${sufijo}@platlia.test`);

  const clave = page.getByLabel("Contraseña", { exact: true });

  // `Bar123!` cumple las cuatro clases y son siete caracteres: es exactamente
  // el caso por el que el mínimo es 10 y no 8.
  await clave.fill("Bar123!");
  await expect(page.getByText(/al menos 10 caracteres/i)).toBeVisible();

  await clave.fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill(CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();

  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);
});
