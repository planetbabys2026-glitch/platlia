import { expect, test } from "@playwright/test";
import {
  abrirCaja,
  agregarProducto,
  dejarCajaCerrada,
  ingresar,
  laCuenta,
  sumarUnidad,
} from "./apoyo";

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
  // La apertura vive en la sección "movimientos", y a una sección se llega por
  // la URL desde que el menú es el único navegador.
  await page.goto("/caja?vista=movimientos");
  await page.getByLabel(/base en efectivo/i).fill("100000");
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(page.getByRole("heading", { name: /^caja 1$/i })).toBeVisible();
  await expect(page.getByText("Esperado en efectivo").locator("..")).toContainText(
    "$100.000",
  );

  // ── Sentar la mesa 1 ─────────────────────────────────────────────────────
  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await expect(page.getByRole("heading", { name: "Mesa 1" })).toBeVisible();

  // ── Cantar una cerveza de $5.000 ─────────────────────────────────────────
  // Con `agregarProducto` y no con un clic suelto: React 19 no mejora
  // progresivamente `<form action={serverAction}>`, así que un clic anterior a la
  // hidratación se pierde sin dejar error.
  await agregarProducto(page, /cerveza nacional \(botella\)/i);
  const cuenta = laCuenta(page);

  // Impuesto al consumo del 8% incluido en el precio: $5.000 se desagrega en
  // $4.630 de base y $370 de impuesto. Es la regla 5 del proyecto, en pantalla.
  await expect(cuenta.getByText("Base gravable").locator("..")).toContainText("$4.630");
  await expect(cuenta.getByText("Impuesto").locator("..")).toContainText("$370");
  await expect(cuenta.getByText("Total").locator("..")).toContainText("$5.000");

  // ── Subir a 3 unidades: el redondeo es POR LÍNEA ──────────────────────────
  // Por nombre accesible y acotado a la cuenta: un `name: "+"` suelto agarraba el
  // "+ Nueva cuenta" de la pantalla de la mesa.
  await sumarUnidad(page, "$10.000");
  await sumarUnidad(page, "$15.000");
  // Un renglón de 3 redondea una sola vez: $13.889 + $1.111, no $13.890 + $1.110.
  await expect(cuenta.getByText("Base gravable").locator("..")).toContainText("$13.889");
  await expect(cuenta.getByText("Impuesto").locator("..")).toContainText("$1.111");

  // ── La cocina no manda la cuenta a la caja ───────────────────────────────
  // Que el plato salga no es que el cliente quiera irse: hasta que alguien la
  // mande, esta cuenta no existe para el cajero.
  await page.getByRole("button", { name: /mandar comanda a cocina/i }).click();
  await expect(page.getByRole("button", { name: /comanda en cocina/i })).toBeVisible();

  await page.goto("/caja");
  await expect(page.getByText(/mesa 1/i)).toHaveCount(0);

  // ── Pedir la cuenta: recién ahí llega a la caja ──────────────────────────
  await page.goBack();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await page.getByRole("button", { name: /pedir la cuenta/i }).click();
  await expect(page).toHaveURL(/\/salon$/);

  // ── Cobrar en la caja con $20.000 ────────────────────────────────────────
  await page.goto("/caja");
  const cobro = page.getByRole("region", { name: "Cuentas por cobrar" });
  await expect(cobro.getByText(/mesa 1/i).first()).toBeVisible();

  const desplegar = cobro.getByRole("button", { name: /^cobrar cuenta$/i }).first();
  if (await desplegar.isVisible().catch(() => false)) await desplegar.click();

  await cobro.getByLabel(/efectivo recibido/i).fill("20000");
  await expect(cobro.getByText(/cambio \/ devuelta/i).locator("..")).toContainText("$5.000");
  await cobro.getByRole("button", { name: /confirmar pago de/i }).click();

  // Cobrada, la cuenta se va de "por cobrar" y aparece en el historial.
  await expect(cobro.getByText(/mesa 1/i)).toHaveCount(0);

  // ── La mesa quedó libre ──────────────────────────────────────────────────
  await page.goto("/salon");
  await expect(
    page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }),
  ).toBeVisible();

  // ── El cierre cuadra: base + venta en efectivo ───────────────────────────
  await page.goto("/caja?vista=movimientos");
  await expect(page.getByText("Ventas en efectivo").locator("..")).toContainText("$15.000");
  await expect(page.getByText("Esperado en efectivo").locator("..")).toContainText(
    "$115.000",
  );

  await page.getByLabel(/cuánto contaste/i).fill("115000");
  // El turno cuadra dos saldos: el cajón y la cuenta del banco.
  await page.getByLabel(/cuánto dice la cuenta/i).fill("0");
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
  await agregarProducto(page, /cerveza nacional \(botella\)/i);

  // El pedido quedó en el carrito y nunca se mandó a COCINA, así que no aparece
  // en "por cobrar": la caja lista lo que ya se sirvió, y esto todavía no se
  // sirvió. La red que impide olvidarlo es el cierre de turno, que lo nombra.
  await page.goto("/caja");
  await expect(
    page.getByRole("region", { name: "Cuentas por cobrar" }).getByText(/mesa 2/i),
  ).toHaveCount(0);

  await page.goto("/caja?vista=movimientos");
  await page.getByLabel(/cuánto contaste/i).fill("5000");
  // El turno cuadra dos saldos: el cajón y la cuenta del banco.
  await page.getByLabel(/cuánto dice la cuenta/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();
  await expect(page.getByRole("alert").first()).toContainText(/sin cobrar/i);
  await expect(page.getByRole("alert").first()).toContainText(/mesa 2/i);
});
