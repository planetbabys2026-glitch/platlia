import { expect, test, type Page } from "@playwright/test";
import { abrirCaja, dejarCajaCerrada, ingresar } from "./apoyo";

/**
 * El informe de la jornada.
 *
 * Lo que se prueba es que la venta que acaba de ocurrir aparezca con las cifras
 * exactas —incluida la desagregación del impuesto—, porque el informe es lo que
 * el dueño usa para decidir y lo que el contador usa para declarar.
 */
test.describe.configure({ mode: "serial" });

test("una venta cobrada aparece en el informe con el impuesto desagregado", async ({
  page,
}) => {
  await ingresar(page);
  await dejarCajaCerrada(page);

  // Punto de partida: lo que el informe ya trae de esta jornada.
  await page.goto("/informes");
  await expect(page.getByRole("heading", { name: "Informes" })).toBeVisible();
  const ventasAntes = await leerCifra(page, "Ventas");
  const pedidosAntes = await leerCifra(page, "Pedidos");

  // Se vende: tres cervezas de $5.000 con 8% incluido.
  await abrirCaja(page);

  await page.goto("/salon");
  await page.getByRole("button", { name: /abrir pedido en la mesa 6$/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);
  await page.getByRole("button", { name: /cerveza nacional \(botella\)/i }).click();
  await page.getByRole("button", { name: "+" }).first().click();
  await page.getByRole("button", { name: "+" }).first().click();
  await expect(page.getByRole("complementary", { name: "La cuenta" }).getByText("Total").locator("..")).toContainText(
    "$15.000",
  );
  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();

  // El informe ya la refleja.
  await page.goto("/informes");
  expect(await leerCifra(page, "Ventas")).toBe(ventasAntes + 15000);
  expect(await leerCifra(page, "Pedidos")).toBe(pedidosAntes + 1);

  // La desagregación es la que declara el contador: base + impuesto = venta.
  const tarifa = page.getByRole("listitem").filter({ hasText: "Impuesto al consumo" });
  await expect(tarifa).toContainText("8%");
  await expect(tarifa).toContainText("base gravable");

  // Y el cobro aparece como efectivo.
  await expect(page.getByText("Cómo pagaron").locator("..")).toContainText("Efectivo");

  // Lo más vendido incluye la cerveza.
  await expect(page.getByText("Lo más vendido").locator("..")).toContainText(
    "Cerveza nacional (Botella)",
  );

  await dejarCajaCerrada(page);
});

test("la jornada anterior es otra jornada, no la de hoy", async ({ page }) => {
  await ingresar(page);
  await page.goto("/informes");

  const hoy = await leerJornada(page);

  // Hay que esperar la navegación antes de leer: el click es del lado del
  // cliente y sin esto se lee la página vieja.
  await page.getByRole("link", { name: /día anterior/i }).click();
  await expect(page).toHaveURL(/\?jornada=\d{4}-\d{2}-\d{2}/);
  const ayer = await leerJornada(page);

  expect(ayer).not.toBe(hoy);
  await expect(page.getByRole("link", { name: /^hoy$/i })).toBeVisible();
});

test("una jornada inventada en la URL no tumba la página", async ({ page }) => {
  await ingresar(page);
  await page.goto("/informes?jornada=no-es-una-fecha");

  // Se cae al día en curso en vez de reventar: es lo que la persona quería ver.
  await expect(page.getByRole("heading", { name: "Informes" })).toBeVisible();
  await expect(page.getByText(/en curso/)).toBeVisible();
});

/** Lee una tarjeta de indicador y devuelve su cifra en pesos enteros. */
async function leerCifra(page: Page, titulo: string): Promise<number> {
  const tarjeta = page.getByText(titulo, { exact: true }).locator("..");
  const texto = (await tarjeta.textContent()) ?? "";
  const cifra = /\$?([\d.]+)/.exec(texto.replace(titulo, ""))?.[1] ?? "0";
  return Number(cifra.replace(/\./g, ""));
}

async function leerJornada(page: Page): Promise<string> {
  const texto = (await page.getByText(/Jornada del/).textContent()) ?? "";
  return /(\d{4}-\d{2}-\d{2})/.exec(texto)?.[1] ?? "";
}
