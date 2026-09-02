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

/**
 * Abrir y cerrar el turno viven en la sección "movimientos" de la caja, y a una
 * sección se llega por la URL.
 *
 * Antes esto era una píldora dentro de la pantalla y los ayudantes la clickeaban.
 * Cuando las píldoras internas se fueron —el menú pasó a ser el único navegador
 * de secciones— el clic dejó de encontrar nada, `dejarCajaCerrada` daba por
 * cerrada una caja que seguía abierta y **toda la suite** fallaba en su
 * `beforeEach` con un "no encuentro el campo base del turno" que no menciona
 * nada de esto.
 */
const CIERRE_DE_TURNO = "/caja?vista=movimientos";

/**
 * La cuenta de la pantalla de pedido, ya desambiguada del menú lateral.
 *
 * El nombre accesible es "Resumen de la cuenta" (`app/(app)/pedido/[id]/page.tsx`).
 * Este ayudante buscaba "La cuenta", que no existe en ninguna parte: devolvía un
 * locator vacío, así que `agregarProducto` y todo lo que se apoya en él esperaban
 * un renglón que nunca iba a aparecer. `.first()` porque el mismo panel se pinta
 * dos veces —el aside de escritorio y el cajón del teléfono—.
 */
export function laCuenta(page: Page) {
  return page.getByRole("complementary", { name: /resumen de la cuenta/i }).first();
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
/**
 * Despliega la categoría que esconde un producto.
 *
 * Las categorías de la carta **arrancan cerradas y solo una se abre a la vez**,
 * así que el botón del plato no está tocable hasta que alguien abre su sección.
 * `agregarProducto` clickeaba el producto directo y se quedaba esperando un botón
 * que no iba a aparecer nunca: 120 segundos de presupuesto y un mensaje que no
 * menciona categorías por ningún lado.
 *
 * Se recorren los encabezados por índice y no "el primero cerrado": abrir uno
 * cierra el que estaba, así que "el primero cerrado" vuelve a ser el anterior y
 * el bucle rebota entre dos categorías para siempre.
 */
async function abrirCategoriaDe(page: Page, producto: RegExp) {
  const boton = page.getByRole("button", { name: producto }).first();
  if (await boton.isVisible().catch(() => false)) return;

  /**
   * Esperar la carta ANTES de contar acordeones.
   *
   * `agregarProducto` se llama apenas se abre la mesa, así que la primera vuelta
   * corre contra una pantalla que todavía no pintó la carta: el barrido contaba
   * cero encabezados, no abría nada, y el clic de después se quedaba los 120
   * segundos del presupuesto esperando un botón que seguía `inert`. El síntoma
   * —"waiting for getByRole button cerveza"— no menciona ni categorías ni carga.
   */
  const carta = page.getByRole("region", { name: "Carta de productos" });
  await carta.waitFor({ timeout: 15_000 }).catch(() => {});

  // Acotado a la carta: la barra lateral también tiene acordeones con
  // `aria-expanded`, y abrirlos no acerca a ningún plato.
  const encabezados = carta.locator("button[aria-expanded]");
  const cuantos = await encabezados.count();

  for (let i = 0; i < cuantos; i++) {
    const encabezado = encabezados.nth(i);
    if ((await encabezado.getAttribute("aria-expanded")) === "false") {
      await encabezado.click();
    }
    if (await boton.isVisible().catch(() => false)) return;
  }
}

export async function agregarProducto(page: Page, producto: RegExp) {
  const cuenta = laCuenta(page);

  /**
   * Todo acotado al renglón de ESTE producto.
   *
   * Antes `confirmado` era el primer botón "Agregar una unidad" de toda la
   * cuenta, y eso hacía que la función **mintiera**: con cualquier otro renglón ya
   * en la cuenta —el producto anterior de la misma prueba, o una mesa que se
   * retomó ocupada— el botón ya estaba visible, la función devolvía al instante y
   * **el producto nunca se agregaba**. El fallo aparecía tres pasos después,
   * buscando en cocina algo que nadie había pedido.
   *
   * El renglón optimista aparece al instante y dice "Agregando…"; el de verdad es
   * el que trae los controles de cantidad, así que ese botón —dentro de su propio
   * `<li>`— es la única señal de que el servidor confirmó.
   */
  const renglon = cuenta.locator("li").filter({ hasText: producto });
  const confirmado = renglon.getByRole("button", { name: /agregar una unidad/i }).first();

  for (let intento = 0; intento < 6; intento++) {
    if (await confirmado.isVisible().catch(() => false)) return;
    // Si el renglón ya está —aunque sea el optimista— no se vuelve a clickear: dos
    // clics son dos unidades, y la prueba de al lado afirma cantidades.
    if (!(await renglon.first().isVisible().catch(() => false))) {
      await abrirCategoriaDe(page, producto);
      await page
        .getByRole("button", { name: producto })
        .first()
        .click({ timeout: 10_000 })
        .catch(() => {});
    }
    try {
      await expect(confirmado).toBeVisible({ timeout: 8000 });
      return;
    } catch {
      // El clic cayó antes de la hidratación: se vuelve a intentar.
    }
  }

  throw new Error(`No se pudo agregar ${producto} a la cuenta.`);
}

/**
 * Sube en uno la cantidad del primer renglón, hasta ver el total esperado.
 *
 * Reintenta por lo mismo que `agregarProducto`: el `<form action={serverAction}>`
 * de `ControlCantidad` no funciona hasta que la página hidrata, y un clic
 * anterior se pierde sin error visible.
 */
export async function sumarUnidad(page: Page, totalEsperado: string) {
  const cuenta = laCuenta(page);
  const boton = cuenta.getByRole("button", { name: /agregar una unidad/i }).first();

  for (let intento = 0; intento < 6; intento++) {
    if (await cuenta.getByText(totalEsperado).first().isVisible().catch(() => false)) return;
    // El botón se deshabilita mientras la acción está en vuelo: sin esperarlo, el
    // reintento cae sobre un botón muerto y se come el presupuesto entero.
    await expect(boton).toBeEnabled({ timeout: 10_000 });
    await boton.click();
    try {
      await expect(cuenta.getByText(totalEsperado).first()).toBeVisible({ timeout: 5000 });
      return;
    } catch {
      // El clic cayó antes de la hidratación: se vuelve a intentar.
    }
  }

  throw new Error(`No se pudo subir la cantidad hasta ${totalEsperado}.`);
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

/**
 * A dónde cae alguien al entrar.
 *
 * `/panel` ya no pinta nada: reparte. La cocina va a su monitor, quien atiende
 * mesas al salón y quien vende de mostrador al POS, así que la prueba no puede
 * fijar una sola ruta.
 */
// `caja` entró a la lista cuando el salón dejó de venir encendido para el
// cajero: su pantalla de trabajo es el arqueo, y abrir el turno es lo primero
// que hace al llegar.
export const PANTALLA_DE_ENTRADA = /\/(salon|pos|cocina|caja)$/;

/**
 * Entra a la aplicación. Por defecto, como el DUEÑO.
 *
 * Antes el usuario por defecto era el CAJERO, y con él se sentaban las mesas en
 * ocho archivos. Desde que el salón dejó de venir encendido para ese rol —lo usa
 * el mesero, que es quien toma pedidos parado al lado de la mesa— esas pruebas
 * caían en un 404 que no menciona permisos por ningún lado.
 *
 * El dueño y no el mesero porque casi todos estos flujos sientan una mesa Y la
 * cobran: con el mesero habría que volver a entrar como cajero en la mitad de
 * cada prueba, que es más lento y más frágil. Que un rol vea lo que le toca lo
 * fija `tests/unit/permisos-roles.test.ts`, que es donde esa regla se puede
 * probar sin navegador.
 */
export async function ingresar(page: Page, datos = DUENO) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);
}

/**
 * El `href` del primer enlace que coincida, o null si no hay ninguno.
 *
 * Existe por una trampa cara: **`locator.getAttribute()` espera a que el
 * elemento aparezca**. Sin pedidos abiertos —que es el caso normal al terminar un
 * archivo— se quedaba esperando el presupuesto ENTERO de la prueba, y el
 * `.catch(() => null)` se comía el error, así que el síntoma era una suite lenta
 * y un `afterEach` que vencía sin decir por qué. Medido: 298 segundos en una sola
 * vuelta de las veinticinco.
 *
 * `count()` no espera: pregunta cuántos hay ahora y contesta.
 */
async function primerEnlace(page: Page, selector: string): Promise<string | null> {
  const enlaces = page.locator(selector);
  if ((await enlaces.count()) === 0) return null;
  return enlaces.first().getAttribute("href", { timeout: 5000 }).catch(() => null);
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

    let href = await primerEnlace(page, 'a[href^="/pedido/"]');

    // Una mesa ocupada ya no enlaza a su pedido sino a su pantalla de cuentas:
    // desde que existen las cuentas separadas puede tener varias, y hay que
    // entrar para llegar a ellas. Sin este salto la función veía cero enlaces y
    // se daba por hecha sin cerrar nada, dejando trabada a toda la suite.
    if (!href) {
      const mesa = await primerEnlace(page, 'a[href^="/salon/mesa/"]');
      if (!mesa) return;

      await page.goto(mesa);
      href = await primerEnlace(page, 'a[href^="/pedido/"]');

      // La mesa quedó sin cuentas entre el listado y esta visita.
      if (!href) continue;
    }

    await page.goto(href);

    /**
     * Esperar a que el velo de carga se vaya ANTES de sondear los botones.
     *
     * Ninguna de las comprobaciones de abajo espera —`isVisible()` no lo hace—,
     * así que sobre una pantalla a medio pintar todas contestan "no está" y el
     * bucle termina lanzando "no supe cómo cerrar el pedido" sobre uno
     * perfectamente cerrable. Es el mismo cuidado que ya tiene `abrirMesa` con su
     * `boton.or(cuadro)`.
     */
    await page
      .getByRole("status", { name: /cargando la pantalla/i })
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => {});

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

    /**
     * Una cuenta de mesa con consumo se cobra en la caja, y ya está ahí.
     *
     * Acá se tocaba "Pedir la cuenta" primero. Ese botón se fue: desde que la
     * caja lista todo lo que salió a cocina, la cuenta llega sola y mandarla era
     * un trámite sin efecto. Se va directo a cobrarla, que es el camino real y el
     * único que tiene un cajero —anular un pedido con productos exige
     * administrador—.
     */
    if (await cobrarLoQueEstaEnCaja(page)) continue;

    // Con consumo y sin poder cobrar acá ni mandarlo: se anula.
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
    const cobrarPos = page.getByRole("button", { name: /cobrar y facturar/i });
    if (await cobrarPos.isVisible().catch(() => false)) {
      await cobrarPos.click();
      await page.getByRole("button", { name: /confirmar pago de/i }).click();
      await expect(page.getByText(/venta cobrada/i)).toBeVisible();
      continue;
    }

    // Con mesas encendidas, el POS de un pedido sin mesa no cobra: manda a caja,
    // y ahí se cobra. Es el camino real desde que una cuenta llega a la caja solo
    // porque alguien la mandó —antes aparecía sola y este caso no existía—.
    const enviarACaja = page.getByRole("button", { name: /^enviar a caja$/i });
    if (await enviarACaja.isVisible().catch(() => false)) {
      await enviarACaja.click();
      await page.getByRole("button", { name: /mandar la cuenta a caja/i }).click();
      await expect(page.getByText(/cuenta enviada a caja/i)).toBeVisible();
      await cobrarLoQueEstaEnCaja(page);
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
/**
 * Cobra todo lo que haya en la caja. Devuelve si llegó a cobrar algo.
 *
 * La pantalla es de dos columnas y **preselecciona la primera cuenta**, así que no
 * hay nada que desplegar: el cobro ya está a la vista. Son dos botones seguidos y
 * se llaman parecido a propósito —el primero abre la verificación con el monto
 * ("Cobrar $15.000") y el segundo confirma ("Cobrar")—, que es el paso que existe
 * para que nadie cobre una cifra que ya no era la del formulario.
 */
async function cobrarLoQueEstaEnCaja(page: Page): Promise<boolean> {
  let cobroAlgo = false;

  for (let vuelta = 0; vuelta < 25; vuelta++) {
    await page.goto("/caja");

    const revisar = page.getByRole("button", { name: /^cobrar \$/i }).first();
    if (!(await revisar.isVisible().catch(() => false))) return cobroAlgo;
    await revisar.click();

    const confirmar = page.getByRole("button", { name: "Cobrar", exact: true }).first();
    if (!(await confirmar.isVisible().catch(() => false))) return cobroAlgo;
    await confirmar.click();
    cobroAlgo = true;

    // El repintado tras una Server Action no siempre llega, así que no se espera
    // un texto: se vuelve a pedir la pantalla y se mira si quedó algo.
    await page.waitForTimeout(1200);
  }

  return cobroAlgo;
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
  await page.goto(CIERRE_DE_TURNO);

  const cerrar = page.getByRole("button", { name: /cerrar caja/i });
  const abrir = page.getByLabel(/base en efectivo/i);

  // Esperar a que la pantalla diga en cuál de los dos estados está, igual que
  // `abrirMesa` con la mesa libre y la ocupada. `isVisible()` no espera: sobre
  // una pantalla que todavía no pintó devuelve "no está", esta función daba por
  // cerrada una caja que seguía abierta, y el archivo siguiente fallaba al
  // abrirla con un mensaje que no menciona nada de esto.
  await expect(cerrar.or(abrir).first()).toBeVisible({ timeout: 15_000 });

  if (!(await cerrar.isVisible().catch(() => false))) return;

  await cerrarPedidosAbiertos(page);

  await page.goto(CIERRE_DE_TURNO);
  // El turno cuadra dos saldos: el cajón y la cuenta del banco.
  await page.getByLabel(/cuánto contaste/i).fill("0");
  await page.getByLabel(/cuánto dice la cuenta/i).fill("0");
  await page.getByRole("button", { name: /cerrar caja/i }).click();

  await expect(page.getByLabel(/base en efectivo/i)).toBeVisible();
}

/** Abre la caja partiendo de donde sea que esté. */
export async function abrirCaja(page: Page, base = "0") {
  await dejarCajaCerrada(page);
  await page.goto(CIERRE_DE_TURNO);
  await page.getByLabel(/base en efectivo/i).fill(base);
  await page.getByRole("button", { name: /abrir caja/i }).click();
  // El encabezado es el nombre de la CAJA FÍSICA —"Caja 1" en la base sembrada—,
  // no "Caja <n>" del turno: desde que la caja es una entidad, el turno es un
  // número dentro de ella y el título dice dónde está parada la persona.
  await expect(page.getByRole("heading", { name: /^caja 1$/i })).toBeVisible();
}
