import { expect, test } from "@playwright/test";
import { abrirCaja, dejarCajaCerrada, ingresar } from "./apoyo";

/**
 * El turno completo de un bar: abrir caja, sentar una mesa, cantar productos,
 * cobrar y cerrar.
 *
 * Corre en serie y contra la base sembrada, porque hay una sola caja abierta por
 * empresa: dos pruebas en paralelo se pisarían el turno.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await ingresar(page);
  await dejarCajaCerrada(page);
});

test.afterEach(async ({ page }) => {
  await dejarCajaCerrada(page);
});

test("sin caja abierta no se puede tomar un pedido", async ({ page }) => {
  await page.goto("/salon");
  await expect(page.getByText(/no hay caja abierta/i).first()).toBeVisible();

  // El botón de la mesa está, pero la acción del servidor es la que frena.
  await page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }).click();
  await expect(page.getByText(/no hay caja abierta/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/salon$/);
});

test("un turno completo: abrir caja, cobrar una mesa y cuadrar el cierre", async ({
  page,
}) => {
  // ── Abrir la caja con base de $100.000 ────────────────────────────────────
  await page.goto("/caja");
  await page.getByLabel(/base del turno/i).fill("100000");
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(page.getByRole("heading", { name: /^caja \d+$/i })).toBeVisible();
  await expect(page.getByText("Esperado en efectivo").locator("..")).toContainText(
    "$100.000",
  );

  // ── Sentar la mesa 1 ─────────────────────────────────────────────────────
  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await expect(page.getByRole("heading", { name: "Mesa 1" })).toBeVisible();

  // ── Cantar una cerveza de $5.000 ─────────────────────────────────────────
  await page.getByRole("button", { name: /cerveza nacional \(botella\)/i }).click();
  const cuenta = page.getByRole("complementary", { name: "La cuenta" });
  await expect(cuenta).toContainText("Cerveza nacional (Botella)");

  // Impuesto al consumo del 8% incluido en el precio: $5.000 se desagrega en
  // $4.630 de base y $370 de impuesto. Es la regla 5 del proyecto, en pantalla.
  await expect(cuenta.getByText("Base gravable").locator("..")).toContainText("$4.630");
  await expect(cuenta.getByText("Impuesto").locator("..")).toContainText("$370");
  await expect(cuenta.getByText("Total").locator("..")).toContainText("$5.000");

  // ── Subir a 3 unidades: el redondeo es POR LÍNEA ──────────────────────────
  await page.getByRole("button", { name: "+" }).first().click();
  await expect(cuenta).toContainText("$10.000");
  await page.getByRole("button", { name: "+" }).first().click();
  await expect(cuenta.getByText("Total").locator("..")).toContainText("$15.000");
  // Un renglón de 3 redondea una sola vez: $13.889 + $1.111, no $13.890 + $1.110.
  await expect(cuenta.getByText("Base gravable").locator("..")).toContainText("$13.889");
  await expect(cuenta.getByText("Impuesto").locator("..")).toContainText("$1.111");

  // ── Pedir la cuenta y cobrar con $20.000 ─────────────────────────────────
  await page.getByRole("button", { name: /pedir la cuenta/i }).click();
  await expect(page.getByText("Cuenta pedida").first()).toBeVisible();

  await page.getByLabel(/con cuánto paga/i).fill("20000");
  await page.getByRole("button", { name: /registrar pago/i }).click();

  // El pedido queda pagado y el vuelto sigue a la vista: al cerrarse el pedido
  // desaparece la tarjeta de cobro, así que el vuelto se lee del pago guardado.
  await expect(page.getByText("Pagada").first()).toBeVisible();
  const pagos = page.getByRole("complementary", { name: "La cuenta" }).getByText(/vuelto/i).locator("..");
  await expect(pagos).toContainText("$20.000");
  await expect(pagos).toContainText("$5.000");

  // ── La mesa quedó libre ──────────────────────────────────────────────────
  await page.goto("/salon");
  await expect(
    page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }),
  ).toBeVisible();

  // ── El cierre cuadra: base + venta en efectivo ───────────────────────────
  await page.goto("/caja");
  await expect(page.getByText("Ventas en efectivo").locator("..")).toContainText("$15.000");
  await expect(page.getByText("Esperado en efectivo").locator("..")).toContainText(
    "$115.000",
  );

  await page.getByLabel(/cuánto contaste/i).fill("115000");
  await page.getByRole("button", { name: /cerrar caja/i }).click();

  // Cerrada la caja, el resumen del turno queda a la vista: al cerrarse
  // desaparece el formulario, y la diferencia es justo lo que hay que poder
  // mirar después.
  await expect(page.getByRole("heading", { name: /caja cerrada/i })).toBeVisible();
  await expect(page.getByText("Diferencia").locator("..")).toContainText("$0");
  await expect(page.getByText("Contado").locator("..")).toContainText("$115.000");
});

test("un gasto de caja baja lo esperado en el cajón", async ({ page }) => {
  await abrirCaja(page, "50000");

  await page.getByLabel(/monto/i).fill("12000");
  await page.getByLabel(/para qué fue/i).fill("Hielo");
  await page.getByRole("button", { name: /registrar movimiento/i }).click();

  await expect(page.getByText("Gastos y retiros").locator("..")).toContainText("$12.000");
  await expect(page.getByText("Esperado en efectivo").locator("..")).toContainText(
    "$38.000",
  );
});

test("no se puede cerrar la caja con un pedido sin cobrar", async ({ page }) => {
  await abrirCaja(page);

  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 2$/i }).click();
  await page.getByRole("button", { name: /cerveza nacional \(botella\)/i }).click();
  await expect(page.getByRole("complementary", { name: "La cuenta" })).toContainText("Cerveza nacional");

  await page.goto("/caja");
  await page.getByLabel(/cuánto contaste/i).fill("5000");
  await page.getByRole("button", { name: /cerrar caja/i }).click();
  await expect(page.getByRole("alert").first()).toContainText(/sin cobrar/i);

  // Se cobra para dejar la base limpia para la prueba siguiente.
  await page.goto("/salon");
  await page.getByRole("link", { name: /mesa 2/i }).click();
  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();
});
