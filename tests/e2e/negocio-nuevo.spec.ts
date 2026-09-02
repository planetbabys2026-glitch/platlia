import { expect, test } from "@playwright/test";
import { PANTALLA_DE_ENTRADA, agregarProducto, laCuenta } from "./apoyo";

/**
 * El camino del cliente real: alguien se registra y monta su negocio desde cero.
 *
 * Es la prueba que justifica M4. Antes de esta pantalla, un negocio recién
 * creado no tenía forma de cargar una sola mesa ni un solo producto, así que todo
 * lo construido en M3 le resultaba inservible. Acá se hace todo por la interfaz,
 * sin tocar el seed.
 */
test.describe.configure({ mode: "serial" });

const sufijo = Date.now().toString(36);
const NEGOCIO = `Bar M4 ${sufijo}`;
const CORREO = `m4-${sufijo}@platlia.test`;
const CLAVE = "contrasenasegura";

test("de registrarse a cobrar la primera cuenta, sin datos previos", async ({ page }) => {
  // ── Registro ─────────────────────────────────────────────────────────────
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Dueña M4");
  await page.getByLabel("Nombre del negocio").fill(NEGOCIO);
  await page.getByLabel("Correo").fill(CORREO);
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE);
  await page.getByLabel("Repetir contraseña").fill(CLAVE);
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  // Arranca vacío. Se comprueba contra el salón y no contra las tarjetas "Mesas"
  // y "Productos en carta": eran del panel de indicadores, que ya no existe.
  await expect(
    page.getByText(/todavía no tiene áreas ni mesas configuradas/i),
  ).toBeVisible();

  // ── Salón: un área y doce mesas de un saque ──────────────────────────────
  await page.goto("/administracion/salon");
  await page.getByLabel("Nombre del área").fill("Salón");
  await page.getByRole("button", { name: /agregar área/i }).click();
  await expect(page.getByRole("heading", { name: /^Salón/ })).toBeVisible();

  // Acotado al formulario del lote: Next inyecta su propio role="alert" vacío
  // para anunciar los cambios de ruta y un selector suelto lo agarra a él.
  const formLote = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /crear mesas/i }) });

  await page.getByLabel("Hasta").fill("12");
  await page.getByRole("button", { name: /crear mesas/i }).click();
  await expect(formLote.getByRole("status")).toContainText("Se crearon 12 mesas");

  // El nombre de mesa es único en todo el negocio: repetir el lote no duplica.
  await page.getByRole("button", { name: /crear mesas/i }).click();
  await expect(formLote.getByRole("alert")).toContainText(/ya existen/i);

  // ── Carta: una categoría y un producto ───────────────────────────────────
  await page.goto("/administracion/carta");
  await page.getByLabel("Nombre de la categoría").fill("Cervezas");
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(page.getByRole("heading", { name: /^Cervezas/ })).toBeVisible();

  await page.getByLabel("Producto").fill("Cerveza nacional");
  await page.getByLabel("Precio").fill("5.000");
  await page.getByRole("button", { name: /agregar producto/i }).click();
  await expect(page.getByText("Cerveza nacional")).toBeVisible();
  // El impuesto sale de la tarifa por defecto que se creó con el negocio.
  await expect(page.getByText(/impuesto al consumo 8%/i)).toBeVisible();

  // ── Operar: caja, mesa, cobro ────────────────────────────────────────────
  await page.goto("/caja");
  await page.getByLabel(/base en efectivo/i).fill("0");
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(page.getByRole("heading", { name: /^caja 1$/i })).toBeVisible();

  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 1$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);

  await agregarProducto(page, /cerveza nacional/i);
  const cuenta = laCuenta(page);
  // 8% incluido en $5.000: $4.630 de base y $370 de impuesto.
  await expect(cuenta.getByText("Base gravable").locator("..")).toContainText("$4.630");
  await expect(cuenta.getByText("Total").locator("..")).toContainText("$5.000");

  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();

  // ── Cierre de caja: la venta llegó al corte ──────────────────────────────
  await page.goto("/caja");
  await expect(page.getByText("Ventas en efectivo").locator("..")).toContainText("$5.000");
  await page.getByLabel(/cuánto contaste/i).fill("5000");
  // El turno cuadra dos saldos: el cajón y la cuenta del banco.
  await page.getByLabel(/cuánto dice la cuenta/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();
  await expect(page.getByRole("heading", { name: /caja cerrada/i })).toBeVisible();
  await expect(page.getByText("Diferencia").locator("..")).toContainText("$0");
});

test("la configuración cambia cómo se factura", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(CORREO);
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE);
  await page.getByRole("button", { name: /ingresar/i }).click();
  // Hay que esperar la navegación: un goto inmediato cancela el envío del
  // formulario y la sesión nunca llega a crearse.
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  await page.goto("/administracion/configuracion");

  // Con los precios SIN impuesto incluido, el mismo producto de $5.000 pasa a
  // cobrarse $5.400: la base es el precio y el impuesto se suma encima.
  const formOperacion = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /guardar configuración/i }) });

  await page.getByLabel(/precios de la carta ya incluyen/i).uncheck();
  await page.getByRole("button", { name: /guardar configuración/i }).click();
  await expect(formOperacion.getByRole("status")).toContainText("Guardado");

  await page.goto("/caja");
  await page.getByLabel(/base en efectivo/i).fill("0");
  await page.getByRole("button", { name: /abrir caja/i }).click();

  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 2$/i }).click();
  await agregarProducto(page, /cerveza nacional/i);

  const cuenta = laCuenta(page);
  await expect(cuenta.getByText("Base gravable").locator("..")).toContainText("$5.000");
  await expect(cuenta.getByText("Impuesto").locator("..")).toContainText("$400");
  await expect(cuenta.getByText("Total").locator("..")).toContainText("$5.400");

  // Se cobra y se cierra para no dejar el turno abierto.
  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();
  await page.goto("/caja");
  await page.getByLabel(/cuánto contaste/i).fill("5400");
  // El turno cuadra dos saldos: el cajón y la cuenta del banco.
  await page.getByLabel(/cuánto dice la cuenta/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();
  await expect(page.getByRole("heading", { name: /caja cerrada/i })).toBeVisible();
});
