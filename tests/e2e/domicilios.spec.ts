import { expect, test, type Page } from "@playwright/test";
import { abrirCaja, dejarCajaCerrada, DUENO, ingresar, irA } from "./apoyo";

/**
 * El recorrido completo de un domicilio que entra por el QR.
 *
 * Es el único e2e que cruza las cuatro pantallas —menú público, domicilios,
 * cocina y caja— y existe porque el flujo se rompía justamente en las junturas:
 * cada pantalla hacía lo suyo bien y el pedido igual llegaba a la plancha con una
 * dirección que nadie había leído.
 *
 * Lo que afirma, en orden:
 *
 * 1. Un domicilio del QR **no** entra a la cocina ni a la caja al nacer.
 * 2. Confirmarlo en domicilios —corrigiendo dirección y envío— es lo que lo manda
 *    a la cocina, y recalcula el total en la misma transacción.
 * 3. Cuando la cocina termina el último renglón, el domicilio queda listo y
 *    **recién ahí** aparece en la caja.
 * 4. Cobrarlo lo pone en reparto **solo**: el comensal lo ve sin que nadie toque
 *    el módulo de domicilios.
 * 5. La entrega la confirma domicilios, y el comensal la ve.
 *
 * Corre como el resto: en serie, contra la base sembrada y con una sola caja
 * abierta por empresa.
 */
/**
 * Más tiempo que el resto, y no por lento: este archivo cruza cuatro pantallas y
 * levanta un segundo contexto de navegador para el comensal, así que el
 * presupuesto de 120 s del config se agota **en el gancho de cierre**, con el
 * recorrido ya aprobado. El fallo que produce —"afterEach timeout"— no se parece
 * en nada a la causa.
 */
test.describe.configure({ mode: "serial", timeout: 300_000 });

/**
 * Un nombre distinto por corrida.
 *
 * Los domicilios del día se acumulan si la suite corre dos veces sin volver a
 * sembrar, y dos tarjetas con el mismo nombre hacen que los selectores agarren la
 * de la corrida anterior —que ya está entregada— y la prueba falle diciendo algo
 * que no tiene nada que ver.
 */
const marca = () => Date.now().toString(36).toUpperCase();

const TELEFONO = "3001234567";
const ENVIO_COP = 5000;

/** El producto que pide el comensal: $5.000 y sin modificadores en el seed. */
const PRODUCTO = /cerveza nacional \(botella\)/i;

/** La tarjeta de ESTE domicilio, ya desambiguada de las demás del día. */
function tarjetaDelDomicilio(page: Page, comensal: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: comensal }).first();
}

/**
 * Pide un domicilio desde el menú público, sin sesión, y deja la pantalla en el
 * rastreo. Devuelve la página del comensal para poder seguir mirándola.
 */
async function pedirPorElQr(page: Page, comensal: string, direccion: string) {
  await page.goto("/m/bar-demo");

  // Sin `?mesa` ni `?tableId` el menú abre en modo domicilio.
  await expect(page.getByText(/domicilio \/ para llevar/i)).toBeVisible();

  const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: PRODUCTO }).first();
  await expect(tarjeta).toBeVisible();
  await tarjeta.getByRole("button", { name: /agregar/i }).click();

  await page.getByRole("button", { name: /ver mi pedido \(1\)/i }).click();

  await page.getByPlaceholder(/tu nombre completo/i).fill(comensal);
  await page.getByPlaceholder(/celular \/ whatsapp/i).fill(TELEFONO);
  await page.getByPlaceholder(/dirección exacta/i).fill(direccion);

  await page.getByRole("button", { name: /confirmar y enviar pedido/i }).click();

  // El rastreo arranca solo, y lo primero que dice es que no lo confirmó nadie.
  await expect(page.getByText(/recibido\. el restaurante lo está confirmando/i)).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Espera a que el rastreo del comensal muestre un estado.
 *
 * El aviso viaja por SSE desde `/api/qr/pedido/[id]/stream`, que se apoya en
 * Redis. Esa ruta ya documenta que **sin Redis degrada al botón de refrescar**,
 * que es la misma degradación silenciosa del resto de los streams del proyecto.
 * Atar la prueba a que haya un broker vivo la volvería intermitente por una razón
 * que no tiene nada que ver con lo que viene a comprobar: que el estado cambió
 * **sin que nadie tocara el módulo de domicilios**. Así que se espera el empujón
 * y, si no llega, se refresca a mano y se afirma igual.
 */
async function esperarEstadoDelComensal(page: Page, estado: RegExp) {
  const texto = page.getByText(estado);

  if (await texto.isVisible({ timeout: 15_000 }).catch(() => false)) return;

  await page.getByRole("button", { name: /refrescar estado/i }).click();
  await expect(texto).toBeVisible({ timeout: 15_000 });
}

/**
 * Deja los domicilios por QR abiertos, que es lo que hace el cajero al abrir el
 * turno. El seed los deja apagados —el default de la columna—, así que sin esto
 * el comensal ni siquiera puede pedir.
 */
async function abrirDomiciliosQr(page: Page) {
  await page.goto("/caja?vista=movimientos");
  const abrir = page.getByRole("button", { name: /^abrir domicilios$/i });
  const cerrar = page.getByRole("button", { name: /^cerrar domicilios$/i });
  await expect(abrir.or(cerrar).first()).toBeVisible({ timeout: 15_000 });

  if (await abrir.isVisible().catch(() => false)) {
    await abrir.click();
    await expect(cerrar).toBeVisible({ timeout: 15_000 });
  }
}

/** Lo contrario, para probar la puerta cerrada. */
async function cerrarDomiciliosQr(page: Page) {
  await page.goto("/caja?vista=movimientos");
  const abrir = page.getByRole("button", { name: /^abrir domicilios$/i });
  const cerrar = page.getByRole("button", { name: /^cerrar domicilios$/i });
  await expect(abrir.or(cerrar).first()).toBeVisible({ timeout: 15_000 });

  if (await cerrar.isVisible().catch(() => false)) {
    await cerrar.click();
    await expect(abrir).toBeVisible({ timeout: 15_000 });
  }
}

test.beforeEach(async ({ page }) => {
  // Con el dueño y no con el cajero: el CAJERO no tiene permiso de cocina, y
  // este recorrido pasa por el KDS.
  await ingresar(page, DUENO);
  await abrirCaja(page);
  await abrirDomiciliosQr(page);
});

test.afterEach(async ({ page }) => {
  await dejarCajaCerrada(page);
});

test("del QR a la puerta: el domicilio pasa por domicilios antes que por la cocina", async ({
  page,
  browser,
  baseURL,
}) => {
  const COMENSAL = `Comensal ${marca()}`;
  const DIRECCION_QR = "Cra 70 # 44-10, apto 302";
  const PORTERIA = "Torre B, porteria";

  // El comensal no tiene sesión: contexto aparte, como su propio teléfono.
  const contexto = await browser.newContext({
    baseURL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const comensal = await contexto.newPage();
  const comanda = () => page.locator("article").filter({ hasText: COMENSAL });
  const tarjeta = () => tarjetaDelDomicilio(page, COMENSAL);

  try {
    // ── 1. El comensal pide por el QR ────────────────────────────────────────
    await pedirPorElQr(comensal, COMENSAL, DIRECCION_QR);

    // ── 2. No está en la cocina, ni en la caja ───────────────────────────────
    // Esto es lo que se rompía: el QR sellaba `sentToKitchenAt` en el mismo
    // commit en que el comensal tocaba "enviar", así que la comanda aparecía en
    // la plancha con una dirección que nadie había leído.
    await irA(page, "/cocina");
    await expect(comanda()).toHaveCount(0);

    await irA(page, "/caja");
    await expect(page.getByText(COMENSAL)).toHaveCount(0);

    // ── 3. Domicilios lo confirma, corrigiendo lo que escribió el comensal ────
    await irA(page, "/domicilios");
    await expect(tarjeta()).toBeVisible();
    await expect(tarjeta()).toContainText("Por confirmar");
    // $5.000 del producto: todavía sin envío.
    await expect(tarjeta()).toContainText("$5.000");

    await tarjeta().getByRole("button", { name: /aceptar y pasar a cocina/i }).click();

    // La dirección y el envío se corrigen acá, que es el único momento en que
    // todavía no cuesta nada.
    await tarjeta().getByLabel(/dirección de entrega/i).fill(`${DIRECCION_QR} - ${PORTERIA}`);
    await tarjeta().getByLabel(/costo de envío/i).fill(String(ENVIO_COP));
    await tarjeta().getByRole("button", { name: /confirmar y enviar a cocina/i }).click();

    await expect(tarjeta()).toContainText("En cocina", { timeout: 15_000 });
    // El total se recalculó en la misma transacción: $5.000 + $5.000 de envío.
    await expect(tarjeta()).toContainText("$10.000");
    await expect(tarjeta()).toContainText(PORTERIA);

    // ── 4. Recién ahora la cocina lo ve ──────────────────────────────────────
    await irA(page, "/cocina");
    await expect(comanda().first()).toBeVisible();

    // Y sigue sin estar en la caja: todavía no lo cocinaron.
    await irA(page, "/caja");
    await expect(page.getByText(COMENSAL)).toHaveCount(0);

    // ── 5. La cocina termina y el domicilio queda listo, sola ────────────────
    // `LISTO` es el estado que faltaba, y lo pone `avanzarComanda` al terminar
    // el último renglón: nadie de domicilios toca nada acá.
    await irA(page, "/cocina");
    const empezar = comanda().first().getByRole("button", { name: "Empezar" });
    await expect(empezar).toBeVisible();
    await empezar.click();

    // Esperar a que el botón cambie antes del segundo clic: sin esto el "Listo"
    // cae sobre la pantalla vieja, se pierde sin error, y la prueba falla cinco
    // líneas más abajo diciendo que el domicilio no se despachó.
    const listo = comanda().first().getByRole("button", { name: "Listo" });
    await expect(listo).toBeVisible();
    await listo.click();

    // Y esperar a que el renglón quede marcado antes de irse de la pantalla.
    // `avanzarComanda` promueve el domicilio a LISTO dentro de esa misma acción;
    // un `goto` disparado antes de que termine deja a /domicilios renderizado con
    // el estado viejo, y como Playwright sondea el DOM sin volver a navegar, la
    // prueba falla quince segundos mirando una pantalla que ya nadie va a
    // refrescar. La base, mientras tanto, decía LISTO.
    await expect(comanda().first().getByRole("button", { name: "Entregar" })).toBeVisible();

    await irA(page, "/domicilios");
    await expect(tarjeta()).toContainText("Listo para despachar", { timeout: 15_000 });

    // ── 6. Y ahí sí aparece en la caja ───────────────────────────────────────
    // Antes la caja lo listaba desde que nacía: el cajero veía cuentas de comida
    // que todavía no existía.
    await irA(page, "/caja");
    const cuenta = page.locator('[data-slot="card"]').filter({ hasText: COMENSAL }).first();
    await expect(cuenta).toBeVisible();
    await expect(cuenta).toContainText("Domicilio");

    // Con una sola cuenta la caja la abre desplegada; con varias hay que entrar.
    const desplegar = cuenta.getByRole("button", { name: /^cobrar cuenta$/i });
    if (await desplegar.isVisible().catch(() => false)) await desplegar.click();

    await page.getByRole("button", { name: /confirmar pago/i }).first().click();

    // ── 7. El comensal ve "en camino" sin que nadie toque domicilios ─────────
    // Es el paso que no existía: antes había que ir al módulo a moverlo a mano.
    await esperarEstadoDelComensal(comensal, /en camino a tu ubicación/i);

    // ── 8. La entrega la confirma domicilios ─────────────────────────────────
    await irA(page, "/domicilios");
    await expect(tarjeta()).toContainText("En reparto", { timeout: 15_000 });
    await tarjeta().getByRole("button", { name: /confirmar entrega al cliente/i }).click();

    await expect(tarjeta()).toContainText("Entregado", { timeout: 15_000 });
    await esperarEstadoDelComensal(comensal, /entregado! que lo disfrutes/i);
  } finally {
    await contexto.close();
  }
});

test("anular un domicilio exige motivo y lo saca del circuito", async ({
  page,
  browser,
  baseURL,
}) => {
  const COMENSAL = `Cancela ${marca()}`;

  const contexto = await browser.newContext({
    baseURL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const comensal = await contexto.newPage();
  const tarjeta = () => tarjetaDelDomicilio(page, COMENSAL);

  try {
    await pedirPorElQr(comensal, COMENSAL, "Calle 33 # 6-20");

    await irA(page, "/domicilios");
    await expect(tarjeta()).toContainText("Por confirmar");

    // Sin pasar por la cocina no hay salto posible: la pantalla no ofrece
    // despachar ni entregar un pedido que nadie confirmó. Las transiciones las
    // decide `features/domicilios/reglas.ts`, que tiene sus unitarios; lo que se
    // comprueba acá es que la pantalla no invite a saltárselas.
    await expect(
      tarjeta().getByRole("button", { name: /despachar a reparto/i }),
    ).toHaveCount(0);
    await expect(
      tarjeta().getByRole("button", { name: /confirmar entrega al cliente/i }),
    ).toHaveCount(0);

    await tarjeta().getByRole("button", { name: /^anular pedido$/i }).click();

    // Anular exige decir por qué, igual que anular cualquier venta: el botón no
    // se habilita con el motivo vacío.
    const confirmar = tarjeta().getByRole("button", { name: /confirmar anulación/i });
    await expect(confirmar).toBeDisabled();

    await tarjeta().getByLabel(/motivo de la anulación/i).fill("El cliente canceló");
    await expect(confirmar).toBeEnabled();
    await confirmar.click();

    await expect(tarjeta()).toContainText("Anulado", { timeout: 15_000 });

    // Y deja de estar por cobrar: un pedido anulado no es una cuenta abierta.
    await irA(page, "/caja");
    await expect(page.getByText(COMENSAL)).toHaveCount(0);
  } finally {
    await contexto.close();
  }
});

test("con los domicilios cerrados, el menú QR no deja pedir", async ({
  page,
  browser,
  baseURL,
}) => {
  // El agujero que esto tapa: un comensal mandaba un domicilio a las cuatro de la
  // mañana, con la caja cerrada y el local vacío, y el pedido esperaba a que
  // alguien lo descubriera al otro día. Entraba perfecto; nadie lo estaba
  // haciendo.
  await cerrarDomiciliosQr(page);

  const contexto = await browser.newContext({
    baseURL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
  });
  const comensal = await contexto.newPage();

  try {
    await comensal.goto("/m/bar-demo");

    // Se avisa al ABRIR, no al confirmar: enterarse con la dirección ya escrita
    // es la peor forma de enterarse.
    await expect(comensal.getByText(/no estamos recibiendo domicilios/i)).toBeVisible();

    // La carta sigue a la vista —mirar el menú de un local cerrado es lo que hace
    // quien va a pedir mañana— pero el botón de confirmar no deja.
    const tarjeta = comensal
      .locator('[data-slot="card"]')
      .filter({ hasText: PRODUCTO })
      .first();
    await expect(tarjeta).toBeVisible();
    await tarjeta.getByRole("button", { name: /agregar/i }).click();
    await comensal.getByRole("button", { name: /ver mi pedido \(1\)/i }).click();

    await expect(
      comensal.getByRole("button", { name: /domicilios cerrados por ahora/i }),
    ).toBeDisabled();

    // Y al volver a abrirlos, el mismo carrito se puede mandar.
    await abrirDomiciliosQr(page);
    await comensal.reload();
    await expect(comensal.getByText(/no estamos recibiendo domicilios/i)).toHaveCount(0);
  } finally {
    await contexto.close();
  }
});
