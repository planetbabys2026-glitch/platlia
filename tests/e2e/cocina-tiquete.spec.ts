import { expect, test, type Page } from "@playwright/test";

/**
 * Comandas y tiquete: lo que pasa después de que el mesero canta un producto.
 *
 * En serie y contra la base sembrada: hay una sola caja abierta por empresa.
 */
test.describe.configure({ mode: "serial" });

const CAJERO = { email: "caja@platlia.com", password: "platlia123" };

async function ingresar(page: Page) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(CAJERO.email);
  await page.getByLabel("Contraseña").fill(CAJERO.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

async function dejarCajaCerrada(page: Page) {
  await page.goto("/caja");
  const cerrar = page.getByRole("button", { name: /cerrar caja/i });
  if (await cerrar.isVisible().catch(() => false)) {
    await page.getByLabel(/cuánto contaste/i).fill("0");
    await cerrar.click();
    await expect(page.getByRole("heading", { name: "Caja" })).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  await ingresar(page);
  await dejarCajaCerrada(page);
  await page.goto("/caja");
  await page.getByLabel(/base del turno/i).fill("0");
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(page.getByRole("heading", { name: /^caja \d+$/i })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await dejarCajaCerrada(page);
});

test("lo que se canta aparece en cocina, separado por estación", async ({ page }) => {
  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 3$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  const pedido = page.url();

  // Uno de barra y uno de cocina: el seed les puso estación distinta.
  await page.getByRole("button", { name: /cerveza nacional · botella/i }).click();
  await expect(page.getByRole("complementary")).toContainText("Cerveza nacional");
  await page.getByRole("button", { name: /bandeja paisa/i }).click();
  await expect(page.getByRole("complementary")).toContainText("Bandeja paisa");

  await page.goto("/cocina");
  await expect(page.getByRole("heading", { name: /^barra ·/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^cocina ·/i })).toBeVisible();

  // La comanda avanza pendiente → en preparación → listo.
  const bandeja = page
    .locator("article")
    .filter({ hasText: "Bandeja paisa" })
    .first();
  await expect(bandeja.getByRole("button", { name: "Empezar" })).toBeVisible();
  await bandeja.getByRole("button", { name: "Empezar" }).click();
  await expect(bandeja.getByRole("button", { name: "Listo" })).toBeVisible();
  await bandeja.getByRole("button", { name: "Listo" }).click();

  // Marcada lista, sale de la pantalla de cocina.
  await expect(
    page.locator("article").filter({ hasText: "Bandeja paisa" }),
  ).toHaveCount(0);

  // Se cobra para no dejar el turno trabado.
  await page.goto(pedido);
  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();
});

test("el tiquete sale cuadrado y con el impuesto desagregado", async ({ page }) => {
  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 4$/i }).click();
  // Esperar la navegación antes de leer la URL: sin esto el id capturado es el
  // de la página anterior.
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  const pedido = page.url();

  // Tres cervezas de $5.000: total $15.000, con 8% incluido.
  await page.getByRole("button", { name: /cerveza nacional · botella/i }).click();
  await page.getByRole("button", { name: "+" }).first().click();
  await page.getByRole("button", { name: "+" }).first().click();
  await expect(page.getByRole("complementary").getByText("Total").locator("..")).toContainText(
    "$15.000",
  );

  await page.getByLabel(/con cuánto paga/i).fill("20000");
  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();

  // `auto=0` muestra el tiquete sin abrir el cuadro de impresión.
  const id = pedido.split("/").pop();
  await page.goto(`/imprimir/pedido/${id}?auto=0`);

  const tiquete = page.locator("pre.tiquete");
  const texto = (await tiquete.textContent()) ?? "";

  expect(texto).toContain("BAR DEMO");
  expect(texto).toContain("NIT 901.234.567-8");
  expect(texto).toContain("Mesa 4");
  expect(texto).toContain("Cerveza nacional");
  expect(texto).toMatch(/Impuesto al consumo 8%/);
  expect(texto).toContain("TOTAL");
  expect(texto).toContain("$15.000");
  expect(texto).toContain("Vuelto");
  expect(texto).toContain("$5.000");
  expect(texto).toContain("¡Gracias por su visita!");

  // Ninguna línea se pasa del ancho del rollo de 80 mm: si se pasa, la
  // impresora la parte y el tiquete sale corrido.
  const lineas = texto.split("\n");
  expect(lineas.every((l) => l.length <= 48)).toBe(true);

  // Y la base más el impuesto dan el total, que es lo que el cliente revisa.
  const base = Number(/Base gravable\s+\$([\d.]+)/.exec(texto)?.[1].replace(/\./g, ""));
  const impuesto = Number(/Impuesto al consumo 8%\s+\$([\d.]+)/.exec(texto)?.[1].replace(/\./g, ""));
  expect(base + impuesto).toBe(15000);
});
