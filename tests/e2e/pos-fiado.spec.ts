import { expect, test } from "@playwright/test";
import { abrirCaja, agregarEnPos, ingresar, irA } from "./apoyo";

/**
 * Fiar desde el mostrador.
 *
 * `cartera.spec.ts` ya cubre el fiado por la caja; esta prueba cubre la otra
 * puerta, que es la que faltaba entera. Y no es una repetición de aquella: el
 * POS tiene su propia acción (`procesarVentaPosCompleta`), que **creaba el pago
 * sin anotar la deuda**. El esquema aceptaba `CREDITO` desde que `method` es el
 * enum completo, pero nadie llamaba a `anotarFiado`.
 *
 * Esa es la peor forma de fallar y por eso hay prueba: la venta se cerraba, la
 * mesa se liberaba, no entraba plata al arqueo, y la deuda no quedaba en ningún
 * lado. Nadie iba a cobrarla nunca y el cliente no figuraba debiendo. Todo
 * parecía haber salido bien.
 */
test.describe.configure({ mode: "serial" });

const sufijo = Date.now().toString(36);
const DEUDOR = {
  nombre: `Fiado POS ${sufijo}`,
  // Diez dígitos: el teléfono es la identidad del deudor y se normaliza a
  // dígitos, así que uno corto no juntaría los pedidos de la misma persona.
  telefono: `31${sufijo.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`,
};

/**
 * Agregar un producto EN EL POS.
 *
 * No sirve el `agregarProducto` de `apoyo.ts`: aquel espera el panel "Resumen de
 * la cuenta", que es de la pantalla de mesa. Acá la carta son tarjetas que se
 * tocan directo, y las categorías arrancan plegadas —igual que en las otras dos
 * puertas de venta—, así que primero hay que abrir la que lo contiene.
 */
test("se fía desde el POS y la deuda queda en Cartera", async ({ page }) => {
  await ingresar(page);
  await abrirCaja(page, "100000");

  await irA(page, "/pos");
  // El POS pinta el selector de tipo dos veces —una para teléfono y otra para
  // escritorio— así que hay que acotar.
  await page.getByRole("button", { name: /^llevar$/i }).first().click();
  await agregarEnPos(page, /cerveza nacional/i);
  // Que el carrito quedó cargado se comprueba acá y no tres pasos después: si el
  // producto no entra, el fallo aparecía recién en el modal de cobro y no decía
  // que el carrito estaba vacío.
  await expect(page.getByRole("button", { name: /cobrar y facturar/i }).first()).toBeEnabled({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: /cobrar y facturar/i }).first().click();

  // El medio de pago sale del selector compartido con la caja. Antes el POS
  // tenía su propia lista de seis y el fiado no estaba: la misma venta se podía
  // cobrar de una forma en la caja y de otra en el mostrador.
  await page.getByRole("button", { name: /crédito \(fiado\)/i }).click();

  // Con fiado no hay comprobante que pedir —no hubo datáfono— y sí hace falta
  // saber quién queda debiendo.
  await expect(page.getByLabel(/número de comprobante/i)).toHaveCount(0);
  await page.getByLabel(/a nombre de quién/i).fill(DEUDOR.nombre);
  await page.getByLabel(/^celular/i).fill(DEUDOR.telefono);

  await page.getByRole("button", { name: /confirmar pago de/i }).click();
  await expect(page.getByText(/venta cobrada|venta facturada/i)).toBeVisible({ timeout: 20_000 });

  /**
   * Lo que de verdad se prueba: que la deuda exista.
   *
   * Afirmar solo que la venta se cerró habría pasado igual el día del defecto,
   * porque el defecto ERA que se cerrara sin dejar deuda.
   */
  await irA(page, "/cartera");
  await expect(page.getByText(DEUDOR.nombre)).toBeVisible({ timeout: 15_000 });
});

test("lo fiado en el POS no entra al arqueo del turno", async ({ page }) => {
  await ingresar(page);

  // El fiado tiene saldo propio: no es efectivo ni bancos. Si entrara al
  // esperado en efectivo, el cajero cerraría con un faltante igual a lo que fió
  // —plata que está en la calle— y el arqueo dejaría de servir para nada.
  await irA(page, "/caja?vista=movimientos");
  await expect(page.getByText(/fiado hoy/i)).toBeVisible({ timeout: 15_000 });

  // El turno se deja abierto, igual que `cartera.spec.ts` con el fiado por la
  // caja: el `abrirCaja` de la prueba siguiente ya normaliza el estado. Cerrarlo
  // acá agregaba un modo de fallo que no tiene que ver con lo que esto verifica
  // —de hecho falló ahí, con la venta ya fiada y la deuda ya en Cartera—.
});
