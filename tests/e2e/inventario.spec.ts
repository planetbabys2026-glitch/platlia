import { expect, test, type Page } from "@playwright/test";
import {
  DUENO,
  abrirCaja,
  abrirMesa,
  agregarProducto,
  cerrarPedidosAbiertos,
  dejarCajaCerrada,
  ingresar,
  irA,
  laCuenta,
} from "./apoyo";

/**
 * El circuito del inventario, de punta a punta.
 *
 * Prueba las tres cosas que estaban rotas: que un producto de reventa se cuente
 * en UN solo lugar, que la pantalla frene la venta ANTES del toque —y no con un
 * error después, con el mesero parado en la mesa— y que la ganancia salga en
 * Informes con el costo congelado al vender.
 *
 * Entra como dueño y no como cajero porque hay que pasar por Configuración.
 */
test.describe.configure({ mode: "serial" });

const PRODUCTO = "Prueba Gaseosa Inventario";

/**
 * Prende o apaga el módulo. Los `<label>` de ese formulario no tienen `htmlFor`,
 * así que se llega a la casilla por su `name` y no por su texto.
 */
async function ponerInventario(page: Page, encendido: boolean) {
  await irA(page, "/administracion/configuracion?vista=modulos");
  const casilla = page.locator('input[name="inventoryEnabled"]');
  await expect(casilla).toBeVisible();
  if ((await casilla.isChecked()) !== encendido) await casilla.click();
  await page.getByRole("button", { name: /guardar módulos/i }).click();
  await expect(casilla).toBeChecked({ checked: encendido });
}

test("un producto de reventa se cuenta en un solo lugar y frena la venta al agotarse", async ({
  page,
}) => {
  await ingresar(page, DUENO);
  await dejarCajaCerrada(page);
  await ponerInventario(page, true);

  // ── Alta: 2 unidades, cuestan $1.000, se venden a $3.000 ─────────────────
  await irA(page, "/inventario?vista=bebidas");
  await page.getByRole("button", { name: /Nueva Bebida/i }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.locator('input[name="name"]').fill(PRODUCTO);
  await dialogo.locator('select[name="categoryId"]').selectOption({ index: 1 });
  await dialogo.locator('input[name="costCop"]').fill("1000");
  await dialogo.locator('input[name="priceCop"]').fill("3000");
  await dialogo.locator('input[name="stockQty"]').fill("2");
  await dialogo.locator('input[name="stockMin"]').fill("1");
  await dialogo.getByRole("button", { name: /Registrar Producto/i }).click();

  await expect(page.getByText(PRODUCTO).first()).toBeVisible();

  // No se fabricó insumo espejo: el producto no aparece entre los insumos, que
  // es donde antes se duplicaba y trepaba para siempre.
  await irA(page, "/inventario");
  await expect(page.getByText(PRODUCTO)).toHaveCount(0);

  // ── Se venden las dos unidades ───────────────────────────────────────────
  await abrirCaja(page);
  await abrirMesa(page, 6);

  const enCarta = new RegExp(PRODUCTO, "i");
  await agregarProducto(page, enCarta);
  await agregarProducto(page, enCarta);
  await expect(laCuenta(page).getByText(enCarta).first()).toBeVisible();

  // La tercera no se puede tocar: la tarjeta ya avisa que no queda. Esto es lo
  // que el salón no hacía —solo miraba `isAvailable`— y el error llegaba recién
  // del servidor, después del toque.
  const boton = page.getByRole("button", { name: enCarta });
  await expect(boton).toBeDisabled();
  await expect(boton).toContainText(/SIN STOCK/i);

  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();

  // ── La ganancia aparece en Informes, con el costo congelado ──────────────
  await irA(page, "/informes?vista=costos");
  const fila = page.getByRole("row").filter({ hasText: PRODUCTO });
  await expect(fila).toBeVisible();
  // 2 × $1.000 de costo. La venta va NETA de impuesto, así que la utilidad es
  // menor que los $6.000 de carta.
  await expect(fila).toContainText("$2.000");

  await cerrarPedidosAbiertos(page);
  await dejarCajaCerrada(page);
  await ponerInventario(page, false);
});
