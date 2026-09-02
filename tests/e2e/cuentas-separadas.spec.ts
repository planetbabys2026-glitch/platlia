import { expect, test } from "@playwright/test";
import { abrirCaja, agregarProducto, dejarCajaCerrada, ingresar, irA } from "./apoyo";

/**
 * Cuentas separadas en una misma mesa.
 *
 * Un grupo que llega junto y pide por separado abre una cuenta por persona: cada
 * una con su nombre, su comanda a cocina y su cobro. Antes esto era imposible
 * —`abrirPedido` rechazaba el segundo pedido de una mesa ocupada— y el mesero
 * tenía que llevar las cuentas en la cabeza y partir el cobro a mano.
 *
 * También cubre el otro agujero del salón: una mesa o un pedido que quedó sin
 * consumo no tenía salida y terminaba trancando el cierre de caja.
 */

const CERVEZA = /cerveza nacional \(botella\)/i;
const PAPAS = /papas a la francesa/i;
const ALITAS = /alitas bbq/i;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await ingresar(page);
  await dejarCajaCerrada(page);
});

test.afterEach(async ({ page }) => {
  await dejarCajaCerrada(page);
});

/** Abre otra cuenta en la mesa que se esté mirando y entra en ella. */
async function nuevaCuenta(page: import("@playwright/test").Page, nombre: string) {
  const formulario = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /nueva cuenta/i }) });
  await formulario.getByLabel("Nombre de la cuenta").fill(nombre);
  await formulario.getByRole("button", { name: /nueva cuenta/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
}

test("dos personas en la misma mesa piden por separado y se cobran por separado", async ({
  page,
}) => {
  // Recorre el turno entero —abrir caja, dos cuentas, cocina, caja, dos cobros—
  // y encima la limpieza del `afterEach` sale del mismo presupuesto: no entra ni
  // de lejos en los 30 segundos por defecto.
  test.setTimeout(180_000);
  await abrirCaja(page, "0");

  // ── La primera cuenta de la mesa 5 ───────────────────────────────────────
  await irA(page, "/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 5$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await expect(page.getByRole("heading", { name: "Mesa 5" })).toBeVisible();
  await agregarProducto(page, CERVEZA);

  // Se le pone nombre desde la pantalla de la mesa.
  await page.getByRole("link", { name: /← mesa 5/i }).click();
  await expect(page).toHaveURL(/\/salon\/mesa\/[a-z0-9]+$/i);

  const primera = page.getByRole("listitem").filter({ hasText: "Cuenta 1" });
  await primera.getByLabel("Nombre de la cuenta").fill("Andrés");
  await primera.getByRole("button", { name: /guardar/i }).click();
  await expect(page.getByText("Andrés").first()).toBeVisible();

  // ── La segunda cuenta, en la MISMA mesa ──────────────────────────────────
  await nuevaCuenta(page, "Camila");
  await agregarProducto(page, PAPAS);

  await page.getByRole("link", { name: /← mesa 5/i }).click();
  await expect(page).toHaveURL(/\/salon\/mesa\/[a-z0-9]+$/i);
  await expect(page.getByText("2 cuentas abiertas")).toBeVisible();
  await expect(page.getByText("Andrés").first()).toBeVisible();
  await expect(page.getByText("Camila").first()).toBeVisible();

  // El salón cuenta UNA mesa ocupada con DOS cuentas, no dos mesas.
  await irA(page, "/salon");
  await expect(page.getByText("1 OCUPADA", { exact: true })).toBeVisible();
  await expect(page.getByText("2 CUENTAS", { exact: true })).toBeVisible();

  // ── Caja: las dos cuentas, agrupadas bajo su mesa ────────────────────────
  await irA(page, "/caja");
  await expect(page.getByText("2 cuentas separadas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mesa 5 · Andrés" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mesa 5 · Camila" })).toBeVisible();

  // El negocio sembrado no tiene facturación electrónica: el cobro no pide un
  // solo dato fiscal. Es la garantía de que no le metimos fricción a quien no
  // la necesita, que son casi todos.
  await expect(page.getByText("Facturación electrónica")).toHaveCount(0);

  // ── Se cobra solo una: la mesa sigue ocupada ─────────────────────────────
  const deCamila = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Mesa 5 · Camila" }) });
  await deCamila.getByRole("button", { name: /cobrar en caja/i }).click();
  await deCamila.getByRole("button", { name: /confirmar pago/i }).click();
  await expect(page.getByRole("heading", { name: "Mesa 5 · Camila" })).toHaveCount(0);

  await irA(page, "/salon");
  // Esto es lo que fallaba antes: cobrar una cuenta liberaba la mesa entera.
  await expect(page.getByRole("link", { name: "Mesa 5" })).toBeVisible();

  // ── Se cobra la otra: recién ahí la mesa queda libre ─────────────────────
  await irA(page, "/caja");
  // Con una sola cuenta pendiente, la caja despliega el cobro sola: no hay botón
  // intermedio que tocar.
  await page.getByRole("button", { name: /confirmar pago/i }).first().click();
  // Cobrada la última, la caja se queda sin nada pendiente.
  await expect(page.getByText(/no hay cuentas ni tickets pendientes/i)).toBeVisible();

  await irA(page, "/salon");
  await expect(page.getByRole("button", { name: /abrir pedido en la mesa 5$/i })).toBeVisible();
});

test("la comanda de cocina dice de qué cuenta viene cada plato", async ({ page }) => {
  test.setTimeout(180_000);
  await abrirCaja(page, "0");

  await irA(page, "/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 6$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await agregarProducto(page, PAPAS);
  await page.getByRole("button", { name: /confirmar pedido y enviar a cocina/i }).click();
  await expect(page.getByRole("button", { name: /comanda enviada/i })).toBeVisible();

  await page.getByRole("link", { name: /← mesa 6/i }).click();
  await expect(page).toHaveURL(/\/salon\/mesa\/[a-z0-9]+$/i);

  await nuevaCuenta(page, "Sofía");
  await agregarProducto(page, ALITAS);
  await page.getByRole("button", { name: /confirmar pedido y enviar a cocina/i }).click();
  await expect(page.getByRole("button", { name: /comanda enviada/i })).toBeVisible();

  // Cocina ve DOS comandas de la misma mesa, distinguibles por nombre.
  await irA(page, "/cocina");
  const comandas = page.getByRole("article").filter({ hasText: "Mesa 6" });
  await expect(comandas).toHaveCount(2);
  await expect(comandas.filter({ hasText: "Sofía" })).toHaveCount(1);
  await expect(comandas.filter({ hasText: "Cuenta 1" })).toHaveCount(1);
});

test("una mesa abierta por error se cierra sin motivo y sin cajero", async ({ page }) => {
  await abrirCaja(page, "0");

  await irA(page, "/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 7$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);

  // Sin nada pedido no hay qué cobrar, y no se pide motivo.
  await page.getByRole("button", { name: /cerrar sin consumo/i }).click();
  await expect(page.getByText("Anulada").first()).toBeVisible();

  await irA(page, "/salon");
  await expect(page.getByRole("button", { name: /abrir pedido en la mesa 7$/i })).toBeVisible();

  // Y la caja cierra sin quejarse de cuentas colgadas.
  await irA(page, "/caja");
  await page.getByLabel(/cuánto contaste/i).fill("0");
  // El turno cuadra dos saldos: el cajón y la cuenta del banco.
  await page.getByLabel(/cuánto dice la cuenta/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();
  await expect(page.getByLabel(/base en efectivo/i)).toBeVisible();
});

test("un pedido para llevar sin productos se cierra desde el salón", async ({ page }) => {
  await abrirCaja(page, "0");

  await irA(page, "/salon");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await irA(page, "/salon");

  // Este es el caso reportado: sin productos, el POS no lo dejaba cerrar, caja
  // no lo listaba y quedaba abierto para siempre.
  const sinMesa = page.locator("li").filter({ hasText: /sin productos/i }).first();
  await expect(sinMesa).toBeVisible();
  await sinMesa.getByRole("button", { name: /^cerrar$/i }).click();

  await expect(page.getByText(/sin productos/i)).toHaveCount(0);
});
