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

/** La cuenta de la pantalla de pedido, ya desambiguada del menú lateral. */
export function laCuenta(page: Page) {
  return page.getByRole("complementary", { name: "La cuenta" });
}

/**
 * Agrega un producto de la carta a la cuenta y espera a verlo en el renglón.
 *
 * Reintenta a propósito. React 19 NO mejora progresivamente
 * `<form action={serverAction}>`: hasta que la página hidrata, el formulario
 * lleva literalmente `action="javascript:throw new Error('A React form was
 * unexpectedly submitted…')"`, así que un clic temprano se pierde sin error
 * visible y la prueba falla cinco líneas más abajo comprobando algo que nunca
 * pasó. Antes de cada reintento verifica que el renglón siga sin estar, para no
 * terminar agregando el producto dos veces.
 *
 * Se comprueba con `toBeVisible` sobre el renglón y no con `toContainText` sobre
 * la cuenta entera porque `innerText` —que es lo que usa `toContainText`— devuelve
 * el panel a medias mientras las tarjetas todavía están animando su entrada.
 */
export async function agregarProducto(page: Page, producto: RegExp) {
  const renglon = laCuenta(page).getByText(producto).first();

  for (let intento = 0; intento < 6; intento++) {
    if (await renglon.isVisible().catch(() => false)) return;
    await page.getByRole("button", { name: producto }).click();
    try {
      await expect(renglon).toBeVisible({ timeout: 5000 });
      return;
    } catch {
      // El clic cayó antes de la hidratación: se vuelve a intentar.
    }
  }

  throw new Error(`No se pudo agregar ${producto} a la cuenta.`);
}

/**
 * Sienta una mesa desde /salon y deja la pantalla en su cuenta.
 *
 * Reintenta por lo mismo que `agregarProducto`: React 19 no mejora
 * progresivamente `<form action={serverAction}>`, así que un clic anterior a la
 * hidratación se pierde sin error y la prueba falla dos líneas más abajo
 * comprobando una URL que nunca cambió.
 *
 * El caso incómodo es el clic que sí llegó al servidor pero no navegó: la mesa
 * queda ocupada y el botón desaparece. Por eso antes de reintentar se mira si
 * la mesa ya tiene cuenta y, si la tiene, se entra por ahí en vez de abrir otra.
 */
export async function abrirMesa(page: Page, numero: number) {
  const enLaCuenta = /\/pedido\/[a-z0-9]+$/i;

  for (let intento = 0; intento < 5; intento++) {
    await page.goto("/salon");

    const boton = page.getByRole("button", {
      name: new RegExp(`abrir pedido en la mesa ${numero}$`, "i"),
    });
    const cuadro = page.getByRole("link", { name: new RegExp(`^mesa ${numero}$`, "i") });

    // Sin esta espera el sondeo de abajo corre contra una pantalla todavía en
    // blanco, da "no está" para las dos formas de la mesa y las cinco vueltas se
    // queman en un segundo sin haber tocado nada.
    await expect(boton.or(cuadro).first()).toBeVisible({ timeout: 15_000 });

    if (await boton.isVisible().catch(() => false)) {
      await boton.click();
      try {
        await expect(page).toHaveURL(enLaCuenta, { timeout: 8000 });
        return;
      } catch {
        // Se reintenta desde el salón, que ya sabe si la mesa quedó ocupada.
        continue;
      }
    }

    // La mesa ya está ocupada: se entra por su pantalla de cuentas.
    if (!(await cuadro.isVisible().catch(() => false))) continue;

    await cuadro.click();
    await expect(page).toHaveURL(/\/salon\/mesa\/[a-z0-9]+$/i);
    await page.locator('a[href^="/pedido/"]').first().click();
    await expect(page).toHaveURL(enLaCuenta);
    return;
  }

  throw new Error(`No se pudo abrir la mesa ${numero}.`);
}

/**
 * Navega después de haber enviado un formulario.
 *
 * Un `goto` disparado mientras la Server Action todavía está refrescando la
 * pantalla se pisa con ese refresco y Chrome devuelve `net::ERR_ABORTED` —la
 * misma trampa que AGENTS.md documenta para los envíos de formulario—. Esperar a
 * `networkidle` no sirve: las pantallas con SSE nunca quedan quietas. Así que se
 * reintenta, que es lo único que distingue "la navegación se pisó" de "la ruta
 * está rota".
 */
export async function irA(page: Page, ruta: string) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      await page.goto(ruta);
      return;
    } catch (error) {
      if (!String(error).includes("ERR_ABORTED")) throw error;
      await page.waitForTimeout(300);
    }
  }
  await page.goto(ruta);
}

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
  await cobrarLoQueEstaEnCaja(page);
  await page.goto("/salon");
  const entrada = (await page.getByText("404").isVisible().catch(() => false)) ? "/pos" : "/salon";

  for (let vuelta = 0; vuelta < 25; vuelta++) {
    await page.goto(entrada);

    let href = await page.locator('a[href^="/pedido/"]').first().getAttribute("href").catch(() => null);

    // Una mesa ocupada ya no enlaza a su pedido sino a su pantalla de cuentas:
    // desde que existen las cuentas separadas puede tener varias, y hay que
    // entrar para llegar a ellas. Sin este salto la función veía cero enlaces y
    // se daba por hecha sin cerrar nada, dejando trabada a toda la suite.
    if (!href) {
      const mesa = await page
        .locator('a[href^="/salon/mesa/"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      if (!mesa) return;

      await page.goto(mesa);
      href = await page.locator('a[href^="/pedido/"]').first().getAttribute("href").catch(() => null);

      // La mesa quedó sin cuentas entre el listado y esta visita.
      if (!href) continue;
    }

    await page.goto(href);

    const cobrar = page.getByRole("button", { name: /registrar pago/i });
    if (await cobrar.isVisible().catch(() => false)) {
      await cobrar.click();
      await expect(page.getByText("Pagada").first()).toBeVisible();
      continue;
    }

    // Sin nada pedido no hay qué cobrar ni qué anular: se cierra.
    const cerrar = page.getByRole("button", { name: /cerrar sin consumo/i });
    if (await cerrar.isVisible().catch(() => false)) {
      await cerrar.click();
      // Se espera a que el botón se vaya y no a un texto de estado: según de
      // dónde venga el pedido la pantalla resultante es distinta —la cuenta
      // muestra "Anulada", el POS redirige— y lo único común es que ya no se
      // pueda volver a cerrar.
      await expect(cerrar).toBeHidden();
      continue;
    }

    // Con consumo y sin poder cobrar acá (una mesa se cobra en caja): se anula.
    const anular = page.getByRole("button", { name: /anular pedido/i });
    if (await anular.isVisible().catch(() => false)) {
      await page.getByLabel(/motivo de la anulación del pedido/i).fill("Limpieza de pruebas");
      await anular.click();
      await expect(page.getByText("Anulada").first()).toBeVisible();
      continue;
    }

    // Un pedido sin mesa CON productos se abre en el POS, donde el cobro vive
    // dentro de un modal y no hay ni "registrar pago" ni "anular pedido". Sin
    // este caso el bucle daba sus 25 vueltas sin resolver nada y dejaba la caja
    // sin poder cerrarse, que es como se trababa la suite entera.
    const cobrarPos = page.getByRole("button", { name: /cobrar y entregar/i });
    if (await cobrarPos.isVisible().catch(() => false)) {
      await cobrarPos.click();
      await page.getByRole("button", { name: /confirmar pago y cerrar pedido/i }).click();
      await expect(page.getByText(/venta realizada/i)).toBeVisible();
      continue;
    }

    // Nada de lo anterior aplica: seguir dando vueltas no va a cambiarlo.
    throw new Error(
      `No se supo cómo cerrar el pedido ${href}. Revisá qué pantalla lo está mostrando.`,
    );
  }
}

/**
 * Cobra lo que esté esperando en la caja.
 *
 * Es el camino real de una cuenta de mesa: el mesero la manda a caja y ahí se
 * cobra. La ronda por `/pedido/[id]` de abajo no lo cubre —esa pantalla no
 * ofrece "registrar pago" para toda cuenta de mesa— y sin esto quedaban cuentas
 * colgadas que después impedían cerrar el turno.
 */
async function cobrarLoQueEstaEnCaja(page: Page) {
  for (let vuelta = 0; vuelta < 25; vuelta++) {
    await page.goto("/caja");

    // Con varias cuentas hay que desplegar la que se va a cobrar; con una sola,
    // la caja la abre ya desplegada.
    const desplegar = page.getByRole("button", { name: /cobrar en caja/i }).first();
    if (await desplegar.isVisible().catch(() => false)) await desplegar.click();

    const confirmar = page.getByRole("button", { name: /confirmar pago/i }).first();
    if (!(await confirmar.isVisible().catch(() => false))) return;

    await confirmar.click();
    // El repintado tras una Server Action no siempre llega (fallo conocido), así
    // que no se espera un texto: se vuelve a pedir la pantalla y se mira si
    // quedó algo.
    await page.waitForTimeout(1200);
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
  await irAlCierreDeTurno(page);

  const cerrar = page.getByRole("button", { name: /cerrar caja/i });
  if (!(await cerrar.isVisible().catch(() => false))) return;

  await cerrarPedidosAbiertos(page);

  await page.goto("/caja");
  await irAlCierreDeTurno(page);
  await page.getByLabel(/cuánto contaste/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();

  await expect(page.getByLabel(/base del turno/i)).toBeVisible();
}

/**
 * Pone /caja en la pestaña del cierre.
 *
 * Con cuentas pendientes la pantalla abre en "Cobro de Cuentas", donde el botón
 * de cerrar caja no existe. Sin este paso, `dejarCajaCerrada` veía "no está el
 * botón", daba por cerrada una caja que seguía abierta, y el archivo siguiente
 * fallaba al abrirla con un mensaje que no menciona nada de esto.
 */
async function irAlCierreDeTurno(page: Page) {
  const pestana = page.getByRole("button", { name: /movimientos y cierre de turno/i });
  if (await pestana.isVisible().catch(() => false)) {
    await pestana.click();
  }
}

/** Abre la caja partiendo de donde sea que esté. */
export async function abrirCaja(page: Page, base = "0") {
  await dejarCajaCerrada(page);
  await page.goto("/caja");
  await page.getByLabel(/base del turno/i).fill(base);
  await page.getByRole("button", { name: /abrir caja/i }).click();
  await expect(page.getByRole("heading", { name: /^caja \d+$/i })).toBeVisible();
}
