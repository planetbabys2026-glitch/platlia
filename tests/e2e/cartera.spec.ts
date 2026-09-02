import { expect, test, type Page } from "@playwright/test";
import { abrirCaja, abrirMesa, agregarProducto, ingresar, irA, mandarComandaACocina } from "./apoyo";

/**
 * El ciclo del fiado: se fía, la mesa queda libre, el arqueo NO lo cuenta, y se
 * cobra después en Cartera.
 *
 * La afirmación que más importa es la del arqueo: si el fiado entrara al esperado
 * en efectivo, el cajero cerraría con faltante todas las noches por una plata que
 * está en la calle.
 */

test.describe.configure({ mode: "serial" });

const CLIENTE = { nombre: "Andrés Fiado", telefono: "3001234567" };

/** Lee una cifra del arqueo, en pesos enteros y con su signo. */
async function saldoDe(page: Page, termino: string): Promise<number> {
  const texto = (await page.getByText(termino).locator("..").textContent()) ?? "";
  const m = /(-?)\$([\d.]+)/.exec(texto.replace(termino, ""));
  if (!m) throw new Error(`No encontré "${termino}" en: ${texto.slice(0, 120)}`);
  return Number(`${m[1]}${m[2]!.replace(/\./g, "")}`);
}

test("fiar cierra la cuenta y no toca el arqueo", async ({ page }) => {
  await ingresar(page);
  await abrirCaja(page, "100000");

  await irA(page, "/caja?vista=movimientos");
  const efectivoAntes = await saldoDe(page, "Esperado en efectivo");

  // Una mesa con consumo, mandada a cocina para que llegue sola a la caja.
  await abrirMesa(page, 8);
  await agregarProducto(page, /cerveza nacional \(botella\)/i);

  await mandarComandaACocina(page);

  // Se cobra con crédito.
  await irA(page, "/caja");
  await page.getByRole("button", { name: /crédito \(fiado\)/i }).click();
  await page.getByLabel(/^teléfono$/i).fill(CLIENTE.telefono);
  await page.getByLabel(/a nombre de/i).fill(CLIENTE.nombre);

  const revisar = page.getByRole("button", { name: /^cobrar \$/i }).first();
  for (let intento = 0; intento < 5; intento++) {
    await revisar.click();
    const confirmar = page.getByRole("button", { name: "Cobrar", exact: true }).first();
    if (await confirmar.isVisible().catch(() => false)) {
      await confirmar.click();
      break;
    }
  }
  await page.waitForTimeout(1500);

  // La mesa quedó libre: fiar cierra el pedido.
  await irA(page, "/salon");
  await expect(page.getByRole("button", { name: /abrir pedido en la mesa 8$/i })).toBeVisible({
    timeout: 15_000,
  });

  /**
   * Y el arqueo no cambió. Ésta es la regresión que de verdad importa: esa plata
   * no está en el cajón y el cierre no puede pedir que se cuente.
   */
  await irA(page, "/caja?vista=movimientos");
  expect(await saldoDe(page, "Esperado en efectivo")).toBe(efectivoAntes);
  await expect(page.getByText("Fiado hoy")).toBeVisible();
});

test("el abono baja la deuda y ese sí entra al arqueo", async ({ page }) => {
  await ingresar(page);

  await irA(page, "/cartera");
  await expect(page.getByText(CLIENTE.nombre).first()).toBeVisible({ timeout: 15_000 });

  await irA(page, "/caja?vista=movimientos");
  const efectivoAntes = await saldoDe(page, "Esperado en efectivo");

  await irA(page, "/cartera");
  await page.getByRole("button", { name: new RegExp(CLIENTE.nombre, "i") }).first().click();

  const monto = page.getByLabel(/cuánto entregó/i);
  await expect(monto).toBeVisible({ timeout: 15_000 });
  await monto.fill("2000");

  // La previsualización dice qué va a pasar antes de que pase.
  await expect(page.getByText(/queda debiendo|queda al día/i)).toBeVisible();

  const abonar = page.getByRole("button", { name: /registrar abono/i });
  for (let intento = 0; intento < 5; intento++) {
    await abonar.click();
    await page.waitForTimeout(1500);
    await page.reload();
    if (!(await page.getByText(/^\$5\.000$/).first().isVisible().catch(() => false))) break;
  }

  // El abono es un ingreso de caja: entra al arqueo del turno que lo recibió.
  await irA(page, "/caja?vista=movimientos");
  expect(await saldoDe(page, "Esperado en efectivo")).toBe(efectivoAntes + 2000);
});
