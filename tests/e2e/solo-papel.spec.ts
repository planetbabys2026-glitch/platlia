import { expect, test } from "@playwright/test";
import { abrirCaja, abrirMesa, agregarProducto, ingresar, irA, mandarComandaACocina } from "./apoyo";

/**
 * El negocio que trabaja con la comanda en papel.
 *
 * Sin pantalla de cocina **nadie mueve el estado de un plato**: la comanda sale
 * impresa y el sistema no se vuelve a tocar hasta el cobro. Eso rompe dos cosas
 * si no se contempla —el KDS y el turnero quedan vacíos toda la noche— y una
 * tercera que es la que importa: la caja agruparía TODA cuenta en "En curso",
 * esperando un "listo" que nunca va a llegar.
 */

test.describe.configure({ mode: "serial" });

const IMPRESORAS = "/administracion/configuracion?vista=impresoras";

async function elegirDestino(page: import("@playwright/test").Page, etiqueta: RegExp) {
  await irA(page, IMPRESORAS);
  const boton = page.getByRole("button", { name: etiqueta });
  await expect(boton).toBeVisible({ timeout: 15_000 });

  // Se reintenta por la carrera de hidratación de siempre, y se comprueba contra
  // la pantalla recargada: el botón se marca solo cuando el servidor lo guardó.
  for (let intento = 0; intento < 5; intento++) {
    await boton.click();
    await page.waitForTimeout(1200);
    await irA(page, IMPRESORAS);
    if ((await boton.getAttribute("aria-pressed")) === "true") return;
    if (await page.getByText(/comanda.*papel|solo papel/i).first().isVisible().catch(() => false)) return;
  }
}

test("en solo papel no se ofrecen ni cocina ni turnero", async ({ page }) => {
  await ingresar(page);
  await elegirDestino(page, /solo papel/i);

  await irA(page, "/caja");
  const menu = page.getByRole("navigation", { name: /módulos/i });
  await expect(menu.getByRole("link", { name: "Cocina" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Turnero" })).toHaveCount(0);

  // Y no se llega tecleando la URL: el menú nunca es la seguridad.
  await irA(page, "/cocina");
  await expect(page.getByText(/no encontramos esta página/i)).toBeVisible();
});

test("la cuenta llega a la caja lista para cobrar, sin que nadie mueva nada", async ({ page }) => {
  await ingresar(page);
  await abrirCaja(page);

  await abrirMesa(page, 10);
  await agregarProducto(page, /cerveza nacional \(botella\)/i);
  await mandarComandaACocina(page);

  /**
   * Con KDS esto caería en "En curso" —falta que la cocina la marque—. Sin KDS no
   * hay quién la marque, así que tiene que quedar cobrable de una.
   */
  await irA(page, "/caja");
  const lista = page.getByRole("region", { name: "Cuentas por cobrar" });
  await expect(lista.getByText(/mesa 10/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(lista.getByText(/listo para cobrar/i).first()).toBeVisible();
  await expect(lista.getByText(/en curso/i)).toHaveCount(0);
});

test("se devuelve el negocio a pantalla y papel", async ({ page }) => {
  // El seed deja "solo pantalla"; esta prueba lo cambió y las demás corren contra
  // la misma base. Dejarlo como estaba es parte de la prueba.
  await ingresar(page);
  await elegirDestino(page, /solo pantalla/i);

  await irA(page, "/caja");
  await expect(
    page.getByRole("navigation", { name: /módulos/i }).getByRole("link", { name: "Cocina" }),
  ).toBeVisible();
});
