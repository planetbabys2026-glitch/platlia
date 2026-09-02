import { expect, test, type Page } from "@playwright/test";
import { abrirCaja, abrirMesa, agregarProducto, ingresar, irA } from "./apoyo";

/** Lee una cifra del arqueo, en pesos enteros y con su signo. */
async function saldoDe(page: Page, termino: string): Promise<number> {
  const texto = (await page.getByText(termino).locator("..").textContent()) ?? "";
  const m = /(-?)\$([\d.]+)/.exec(texto.replace(termino, ""));
  if (!m) throw new Error(`No encontré la cifra de "${termino}" en: ${texto.slice(0, 120)}`);
  return Number(`${m[1]}${m[2]!.replace(/\./g, "")}`);
}

const saldoDeEfectivo = (page: Page) => saldoDe(page, "Esperado en efectivo");
const saldoDeBancos = (page: Page) => saldoDe(page, "Esperado en bancos");

/**
 * Lo que este archivo viene a comprobar, y que antes no existía:
 *
 * - El turno cuadra **dos** saldos, el del cajón y el de la cuenta del banco, y
 *   un gasto pagado por transferencia no descuenta del cajón.
 * - Una cuenta se **traslada** de mesa y la mesa de origen queda libre sola.
 * - Varias cuentas se **unen** en una, que es la que se cobra.
 */

test.beforeEach(async ({ page }) => {
  await ingresar(page);
});

test("el arqueo cuadra el cajón y el banco por separado", async ({ page }) => {
  await abrirCaja(page, "100000");

  // Los dos saldos existen y arrancan donde tienen que arrancar. La base en
  // bancos queda en cero: `abrirCaja` solo llena el efectivo, que es justo el
  // caso que antes reventaba la apertura entera con "Escribí un monto en pesos".
  await irA(page, "/caja?vista=movimientos");
  await expect(page.getByText("Esperado en efectivo").locator("..")).toContainText("$100.000");

  const efectivoAntes = await saldoDeEfectivo(page);
  const bancosAntes = await saldoDeBancos(page);

  /**
   * El gasto pagado por el banco NO toca el cajón.
   *
   * Es el bug que este trabajo vino a cerrar: hasta acá toda salida descontaba
   * del efectivo, así que pagarle al proveedor por transferencia dejaba el arqueo
   * de la noche con un faltante por plata que nunca había estado en el cajón.
   */
  await page.getByLabel(/de dónde sale/i).selectOption("BANCO");
  await page.getByLabel(/monto/i).fill("30000");
  await page.getByLabel(/para qué fue/i).fill("Proveedor de carnes");
  await page.getByRole("button", { name: /registrar movimiento/i }).click();

  /**
   * Se mide el EFECTO del gasto, no una cifra absoluta.
   *
   * Fijar "-$30.000" daba por hecho que ninguna prueba anterior había dejado un
   * movimiento bancario en la jornada. Lo que esta prueba viene a comprobar es
   * que el gasto por banco descuenta del banco y **no toca el cajón**, y eso se
   * afirma contra el antes y el después.
   */
  await expect(saldoDeBancos(page)).resolves.toBe(bancosAntes - 30_000);
  await expect(saldoDeEfectivo(page)).resolves.toBe(efectivoAntes);
});

test("una cuenta se traslada de mesa y la de origen queda libre", async ({ page }) => {
  await abrirCaja(page);

  // Sin consumo a propósito: trasladar no depende de lo que se haya pedido, y
  // meter un producto acá ataría esta prueba al camino de la carta, que es otro
  // problema y otro archivo.
  await abrirMesa(page, 3);

  /**
   * El traslado se hace desde la cuenta, que es donde está parado el mesero
   * cuando el comensal le dice que se cambia.
   *
   * Se reintenta por lo mismo que `agregarProducto`: hasta que la página hidrata,
   * `<form action={serverAction}>` lleva un `action` que lanza, y el clic se
   * pierde sin error visible —la pantalla queda igual y la prueba falla cinco
   * líneas más abajo comprobando algo que nunca pasó—.
   */
  const select = page.getByLabel(/a qué mesa se pasa/i);
  for (let intento = 0; intento < 5; intento++) {
    if (!(await select.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^trasladar$/i }).first().click();
      await expect(select).toBeVisible();
    }
    // La opción dice "<área> · <mesa>": el mesero elige por dónde queda, no por id.
    await select.selectOption({ label: "Salón · 4" });
    await page.getByRole("button", { name: /mover la cuenta/i }).click();
    try {
      await expect(page.getByText(/mesa 4/i).first()).toBeVisible({ timeout: 8000 });
      break;
    } catch {
      // El clic cayó antes de la hidratación: se vuelve a intentar.
    }
  }

  // La mesa 4 quedó ocupada y la 3 libre. El estado no se escribe: se deriva de
  // las cuentas, así que esto comprueba que las dos se sincronizaron.
  await irA(page, "/salon");
  await expect(page.getByRole("link", { name: /^mesa 4$/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /abrir pedido en la mesa 3$/i }),
  ).toBeVisible();
});

test("dos cuentas de la misma mesa se unen en una sola", async ({ page }) => {
  await abrirCaja(page);

  // La primera cuenta de la mesa.
  await abrirMesa(page, 5);

  // Segunda cuenta en la misma mesa.
  await irA(page, "/salon");
  await page.getByRole("link", { name: /^mesa 5$/i }).click();
  await expect(page).toHaveURL(/\/salon\/mesa\/[a-z0-9]+$/i);
  // Por el marcador y no por la etiqueta: la cuenta que ya existe tiene su
  // propio campo de renombrar con la misma etiqueta accesible.
  await page.getByPlaceholder(/a nombre de quién/i).fill("Camila");
  await page.getByRole("button", { name: /nueva cuenta/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);

  // Y se unen: una paga por las dos.
  await irA(page, "/salon");
  await page.getByRole("link", { name: /^mesa 5$/i }).click();
  // Se reintenta por la carrera de hidratación, igual que el traslado.
  //
  // El resultado se mide contando las cuentas de la mesa —una por enlace de
  // "Tomar pedido"— y no por la tarjeta de unir: al abrirse, esa tarjeta cambia
  // el botón por el formulario, así que "el botón ya no está" también es cierto
  // cuando no pasó nada.
  const cuentas = page.getByRole("link", { name: /tomar pedido \/ adición/i });
  const unir = page.getByRole("button", { name: /unir en una cuenta/i });

  for (let intento = 0; intento < 5; intento++) {
    // Se comprueba ARRIBA y contra la pantalla recargada: si el intento anterior
    // funcionó, la tarjeta de unir ya no existe —solo se dibuja con más de una
    // cuenta— y volver a buscarla es esperar para siempre algo que se fue.
    if ((await cuentas.count()) === 1) break;

    if (!(await unir.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /unir cuentas de esta mesa/i }).click();
      await expect(unir).toBeVisible();
    }
    const casillas = page.getByRole("checkbox");
    await casillas.nth(0).check();
    await casillas.nth(1).check();
    await unir.click();

    await expect(unir).toBeDisabled().catch(() => {});
    await page.reload();
    await expect(cuentas.first()).toBeVisible();
  }

  // Queda UNA cuenta en la mesa: la que se lleva el consumo de las dos.
  await expect(cuentas).toHaveCount(1);
});

test("la comanda llega sola a la caja, sin que nadie la mande", async ({ page }) => {
  await abrirCaja(page);

  await abrirMesa(page, 11);
  await agregarProducto(page, /cerveza nacional \(botella\)/i);

  // Antes de mandar a cocina la cuenta NO está en la caja: todavía no es consumo,
  // es un carrito.
  await irA(page, "/caja");
  const lista = page.getByRole("region", { name: "Cuentas por cobrar" });
  await expect(lista.getByText(/mesa 11/i)).toHaveCount(0);

  // Se manda la comanda a cocina. Nadie toca "enviar a caja".
  await irA(page, "/salon");
  await page.getByRole("link", { name: /^mesa 11$/i }).click();
  await page.getByRole("link", { name: /tomar pedido \/ adición/i }).first().click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);

  const mandar = page.getByRole("button", { name: /cocina/i }).first();
  for (let intento = 0; intento < 5; intento++) {
    await mandar.click();
    try {
      await expect(page.getByText(/en cocina|comanda/i).first()).toBeVisible({ timeout: 8000 });
      break;
    } catch {
      // La carrera de hidratación de siempre.
    }
  }

  // Y ahora sí aparece, sola, en el grupo que corresponde.
  await irA(page, "/caja");
  await expect(lista.getByText(/mesa 11/i).first()).toBeVisible({ timeout: 15_000 });
});
