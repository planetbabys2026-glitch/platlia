import { expect, test } from "@playwright/test";
import { abrirCaja, cerrarPedidosAbiertos, dejarCajaCerrada, ingresar } from "./apoyo";
import { CLAVE_SEMILLA } from "@/prisma/datos-semilla";

const DUENO = { email: "dueno@platlia.com", password: CLAVE_SEMILLA };

/**
 * Negocios sin mesas: el módulo se apaga desde Configuración y la interfaz
 * entera se adapta —el menú, la pantalla de entrada, el formulario de apertura—
 * sin necesitar el módulo MESAS para nada.
 *
 * En serie: deja el negocio sembrado sin mesas al final de cada prueba, para no
 * romper el resto de la suite que sí las necesita. La reactivación va en
 * `afterAll` y no en el último test: si cualquier prueba de acá arriba falla,
 * el modo serie salta el resto del archivo, y un "último test" que nunca llega
 * a correr deja mesas apagado para TODA la suite que sigue —le pasó a esta
 * misma suite más de una vez mientras se escribía—. `afterAll` corre siempre.
 */
test.describe.configure({ mode: "serial" });

async function apagarMesas(page: import("@playwright/test").Page) {
  await page.goto("/administracion/configuracion");
  const casilla = page.getByLabel("Este negocio sienta mesas");
  if (await casilla.isChecked()) {
    await casilla.uncheck();
    await page.getByRole("button", { name: /guardar módulos/i }).click();
    await expect(page.getByText(/apagado: la pantalla de entrada es pos/i)).toBeVisible();
  }
}

async function prenderMesas(page: import("@playwright/test").Page) {
  await page.goto("/administracion/configuracion");
  const casilla = page.getByLabel("Este negocio sienta mesas");
  if (!(await casilla.isChecked())) {
    await casilla.check();
    await page.getByRole("button", { name: /guardar módulos/i }).click();
  }
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await ingresar(page, DUENO);
  await prenderMesas(page);
  await page.close();
});

test("no se puede apagar mesas con una mesa ocupada", async ({ page }) => {
  await ingresar(page, DUENO);
  await abrirCaja(page);

  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);

  await page.goto("/administracion/configuracion");
  await page.getByLabel("Este negocio sienta mesas").uncheck();
  await page.getByRole("button", { name: /guardar módulos/i }).click();
  await expect(page.getByText(/hay una mesa con un pedido abierto/i)).toBeVisible();

  // Se libera la mesa para no dejarla trabada para el resto de la suite.
  await cerrarPedidosAbiertos(page);
  await dejarCajaCerrada(page);
});

test("al apagar mesas, /salon deja de existir y el menú ofrece POS", async ({ page }) => {
  await ingresar(page, DUENO);
  await apagarMesas(page);

  await page.goto("/salon");
  await expect(page.getByText("404")).toBeVisible();

  await page.goto("/panel");
  // exact:true: "Ir al POS" (el botón grande del panel) también matchea "POS"
  // por substring, y acá se está probando específicamente el enlace del menú.
  await expect(page.getByRole("link", { name: "POS", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Salón", exact: true })).toHaveCount(0);
});

// No se reusa `ingresar` de apoyo.ts: ese helper da por sentado que todo el
// mundo llega a /panel, y acá justamente se está probando que cajero y
// administrador ya no lo hacen.
async function ingresarSinAsumirDestino(
  page: import("@playwright/test").Page,
  datos: { email: string; password: string },
) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
}

test("el cajero entra directo a POS, no al panel", async ({ page }) => {
  // Mesas sigue apagado desde la prueba anterior. Contexto de navegador propio
  // de este test: no arrastra la sesión del dueño.
  await ingresarSinAsumirDestino(page, { email: "caja@platlia.com", password: CLAVE_SEMILLA });
  await expect(page).toHaveURL(/\/pos$/);
});

test("el administrador también entra directo a POS", async ({ page }) => {
  await ingresarSinAsumirDestino(page, { email: "admin@platlia.com", password: CLAVE_SEMILLA });
  await expect(page).toHaveURL(/\/pos$/);
});

test("sin mesas, el propietario también entra directo al POS", async ({ page }) => {
  // Ya no hay panel intermedio: `/panel` reparte y nadie ve indicadores al entrar.
  await ingresar(page, DUENO);
  await expect(page).toHaveURL(/\/pos$/);
});

test("desde POS se abre un pedido para llevar y uno a domicilio", async ({ page }) => {
  await ingresar(page, DUENO);
  await abrirCaja(page);
  await page.goto("/pos");

  // El tipo de consumo y los datos del cliente se eligen acá, con el pedido ya
  // abierto y el carrito a la vista. Antes se preguntaban dos veces: una en la
  // barra del salón y otra en esta misma pantalla.
  await page.getByRole("button", { name: /^llevar$/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill("Recoge en mostrador");
  await expect(page.getByRole("button", { name: /cobrar y facturar/i })).toBeVisible();

  // Un domicilio exige celular y dirección, y los pide en el mismo lugar.
  await page.getByRole("button", { name: /^domicilio$/i }).click();
  await expect(page.getByLabel(/celular \/ teléfono/i)).toBeVisible();
  await expect(page.getByLabel(/dirección de entrega/i)).toBeVisible();

  await cerrarPedidosAbiertos(page);
  await dejarCajaCerrada(page);
});

test("al prender mesas de nuevo, /salon vuelve y POS desaparece del menú", async ({ page }) => {
  await ingresar(page, DUENO);
  await prenderMesas(page);

  await page.goto("/salon");
  // level:1 porque "Salón" es el h1 de esta página Y el nombre de un área del
  // salón sembrado: sin acotar el nivel, el h2 del área también matchea.
  await expect(page.getByRole("heading", { name: "Salón", level: 1 })).toBeVisible();

  await expect(page.getByRole("link", { name: "Salón", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "POS", exact: true })).toHaveCount(0);
});
