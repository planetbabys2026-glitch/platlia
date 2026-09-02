import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { abrirMesa, agregarProducto, dejarCajaCerrada, ingresar, irA } from "./apoyo";

/**
 * Avisos en vivo: el pedido que entra se ve desde cualquier pantalla.
 *
 * Antes el aviso moría con la pantalla: `/cocina` y `/domicilios` tenían cada una
 * su conexión, y quien estaba cobrando en `/caja` no se enteraba de nada. Ahora
 * la conexión vive en el shell, que no se vuelve a montar al navegar.
 */

const PAPAS = /papas a la francesa/i;

/**
 * Redis es opcional (`REDIS_URL` en `lib/env.ts`). Sin él los contadores siguen
 * al día por la reconciliación periódica del stream, pero no hay toasts: la
 * prueba del toast se saltea en vez de fallar por algo que no está roto.
 */
function hayRedis(): boolean {
  if (process.env.REDIS_URL) return true;
  try {
    return /^\s*REDIS_URL\s*=\s*\S/m.test(readFileSync(".env", "utf8"));
  } catch {
    return false;
  }
}

/** La barra lateral, ya desambiguada del `<aside>` de la cuenta. */
function menuPrincipal(page: Page) {
  return page.getByRole("complementary", { name: "Menú principal" });
}

/**
 * Manda a cocina lo que haya en la cuenta abierta en esa pantalla.
 *
 * Se espera la respuesta del POST y no un cambio en pantalla, a propósito. Hay
 * un fallo de repintado anterior a este trabajo: la Server Action termina bien
 * en el servidor —el pedido queda enviado, el aviso sale— pero el cliente no
 * resuelve su estado pendiente, así que el botón se queda en "Enviando a
 * cocina…" deshabilitado y nunca dice "Comanda enviada". Mirar la respuesta
 * comprueba lo que de verdad interesa acá sin depender de eso. Recargar tampoco
 * sirve: cancela el POST que todavía está en vuelo.
 *
 * El reintento es por lo mismo que en `agregarProducto`: React 19 no mejora
 * progresivamente los formularios, y un clic anterior a la hidratación se pierde
 * sin dejar rastro.
 */
async function enviarACocina(page: Page) {
  const boton = page.getByRole("button", { name: /confirmar pedido y enviar a cocina/i });

  for (let intento = 0; intento < 4; intento++) {
    const respuesta = page
      .waitForResponse((r) => r.request().method() === "POST" && r.status() < 400, {
        timeout: 10_000,
      })
      .catch(() => null);
    await boton.click();
    if (await respuesta) return;
  }

  throw new Error("La comanda nunca llegó a enviarse.");
}

/**
 * Abre el turno solo si hace falta.
 *
 * Las dos pruebas necesitan caja abierta (`requireOpenCashSession` viene en
 * true) pero ninguna necesita una caja *nueva*. Cerrarla y reabrirla entre
 * pruebas obligaba a resolver antes las cuentas de la anterior, y eso es
 * justamente lo que el fallo de repintado hace poco confiable. Se limpia todo
 * una sola vez al final.
 */
async function asegurarCajaAbierta(page: Page) {
  await irA(page, "/caja");

  const base = page.getByLabel(/base en efectivo/i);
  const turnoAbierto = page.getByRole("heading", { name: /^caja 1$/i });

  // Hay que esperar a que la pantalla pinte antes de decidir. Preguntar
  // `isVisible()` sobre una página en blanco contesta "no" para las dos, y
  // entonces esto daba por abierta una caja cerrada: después `abrirPedido`
  // rechazaba todo con "No hay caja abierta" y el fallo aparecía en el salón,
  // tres pasos más adelante.
  await expect(base.or(turnoAbierto).first()).toBeVisible({ timeout: 15_000 });
  if (!(await base.isVisible().catch(() => false))) return;

  await base.fill("0");
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(turnoAbierto).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await ingresar(page);
  await asegurarCajaAbierta(page);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await ingresar(page);
    await dejarCajaCerrada(page);
  } finally {
    await page.close();
  }
});

test("el menú cuenta las comandas vivas desde una pantalla que no es cocina", async ({ page }) => {
  test.setTimeout(180_000);

  await abrirMesa(page, 9);
  await agregarProducto(page, PAPAS);
  await enviarACocina(page);

  // La prueba de fondo: se lee el contador parado en caja, que no tiene nada que
  // ver con la cocina.
  await irA(page, "/caja");
  await expect(menuPrincipal(page).getByRole("link", { name: "Cocina 1" })).toBeVisible();
});

test("una comanda nueva salta como aviso sin recargar la pantalla", async ({ page, context }) => {
  test.setTimeout(180_000);
  test.skip(!hayRedis(), "Sin REDIS_URL no hay Pub/Sub: los avisos no viajan.");

  // Esta pestaña se queda quieta en caja: es la que tiene que enterarse sola.
  await irA(page, "/caja");
  // El stream se abre al montar el shell; sin este respiro el pedido de la otra
  // pestaña puede publicarse antes de que esta esté escuchando.
  await page.waitForTimeout(1500);

  const otra = await context.newPage();
  try {
    await abrirMesa(otra, 10);
    await agregarProducto(otra, PAPAS);
    await enviarACocina(otra);
  } finally {
    await otra.close();
  }

  // El toast trae de qué mesa y de qué cuenta viene, que es lo que lo hace útil:
  // "llegó algo" a secas obligaría a ir a mirar igual.
  await expect(page.getByText("Mesa 10 · Cuenta 1")).toBeVisible({ timeout: 20_000 });

  // Y el contador se movió sin recargar. No se afirma un número exacto: las dos
  // pruebas comparten la base y la de arriba dejó su propia comanda viva.
  await expect(menuPrincipal(page).getByRole("link", { name: /^Cocina \d+$/ })).toBeVisible();
});
