import { expect, type Page } from "@playwright/test";

/**
 * Utilidades compartidas de los e2e.
 *
 * Existen porque la suite corre contra UNA base con estado singleton —una sola
 * caja abierta por empresa— y cada archivo tiene que poder empezar desde donde
 * sea que lo dejó el anterior.
 */

export const CAJERO = { email: "caja@platlia.com", password: "platlia123" };
export const DUENO = { email: "dueno@platlia.com", password: "platlia123" };

export async function ingresar(page: Page, datos = CAJERO) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

/**
 * Deja sin pedidos vivos, en /salon o en /pos según cuál esté disponible.
 *
 * La caja no cierra con pedidos sin cobrar, así que hay que resolverlos: los que
 * tienen consumo se cobran y los vacíos se anulan. Sin esto, un archivo que
 * falla a mitad de camino deja trabada a toda la suite que sigue.
 *
 * Con mesas apagado /salon responde 404: entrar ahí igual haría que esta
 * función viera "cero enlaces" y se diera por hecha sin haber cerrado nada. Se
 * elige la pantalla una sola vez, al principio, y se usa esa en todo el bucle.
 */
export async function cerrarPedidosAbiertos(page: Page) {
  await page.goto("/salon");
  const entrada = (await page.getByText("404").isVisible().catch(() => false)) ? "/pos" : "/salon";

  for (let vuelta = 0; vuelta < 25; vuelta++) {
    await page.goto(entrada);

    const enlaces = page.locator('a[href^="/pedido/"]');
    const primero = enlaces.first();
    if ((await enlaces.count()) === 0) return;

    const href = await primero.getAttribute("href");
    if (!href) return;

    await page.goto(href);

    const cobrar = page.getByRole("button", { name: /registrar pago/i });
    if (await cobrar.isVisible().catch(() => false)) {
      await cobrar.click();
      await expect(page.getByText("Pagada").first()).toBeVisible();
      continue;
    }

    // Sin consumo no hay nada que cobrar: se anula.
    const anular = page.getByRole("button", { name: /anular pedido/i });
    if (await anular.isVisible().catch(() => false)) {
      await page.getByLabel(/motivo de la anulación del pedido/i).fill("Limpieza de pruebas");
      await anular.click();
      await expect(page.getByText("Anulada").first()).toBeVisible();
    }
  }
}

/**
 * Deja la caja cerrada, de verdad.
 *
 * La versión anterior comprobaba `getByRole("heading", { name: "Caja" })`, que
 * también coincide con "Caja 3": daba por cerrada una caja que seguía abierta y
 * los fallos aparecían tres archivos después. Ahora se comprueba lo único que
 * distingue los dos estados: el formulario de apertura.
 */
export async function dejarCajaCerrada(page: Page) {
  await page.goto("/caja");

  const cerrar = page.getByRole("button", { name: /cerrar caja/i });
  if (!(await cerrar.isVisible().catch(() => false))) return;

  await cerrarPedidosAbiertos(page);

  await page.goto("/caja");
  await page.getByLabel(/cuánto contaste/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();

  await expect(page.getByLabel(/base del turno/i)).toBeVisible();
}

/** Abre la caja partiendo de donde sea que esté. */
export async function abrirCaja(page: Page, base = "0") {
  await dejarCajaCerrada(page);
  await page.goto("/caja");
  await page.getByLabel(/base del turno/i).fill(base);
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(page.getByRole("heading", { name: /^caja \d+$/i })).toBeVisible();
}
