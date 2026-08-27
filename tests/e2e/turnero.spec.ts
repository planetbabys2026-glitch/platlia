import { expect, test } from "@playwright/test";
import { abrirCaja, dejarCajaCerrada, ingresar, laCuenta } from "./apoyo";

/**
 * El recorrido de un pedido para llevar, de punta a punta.
 *
 * Es el circuito que quedó abierto hasta ahora: el mesero canta, la cocina
 * prepara, el televisor lo llama y alguien lo entrega. Cada paso se comprueba en
 * la pantalla donde la persona realmente está parada.
 */
test.describe.configure({ mode: "serial" });

test("un pedido para llevar recorre cocina, turnero y entrega", async ({ page }) => {
  await ingresar(page);
  await abrirCaja(page);

  // ── Se abre un pedido sin mesa: eso es lo que le da número de turno ───────
  // El salón ya no pide nada acá: era el mismo dato que la pantalla del pedido
  // volvía a preguntar dos segundos después. El nombre y el tipo de consumo se
  // eligen adentro, con el pedido ya abierto.
  await page.goto("/salon");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-z0-9]+$/i);

  const encabezado = page.getByText(/turno \d+/i).first();
  await expect(encabezado).toBeVisible();
  const turno = /turno (\d+)/i.exec((await encabezado.textContent()) ?? "")?.[1] ?? "";
  expect(turno).not.toBe("");

  await page.getByRole("button", { name: /bandeja paisa/i }).click();
  await expect(laCuenta(page)).toContainText("Bandeja paisa");

  // ── En el televisor está "en preparación", no listo ──────────────────────
  await page.goto("/turnero");
  const listos = page.locator("section").filter({ hasText: "Listos" }).first();
  const preparando = page.locator("section").filter({ hasText: "En preparación" }).first();
  await expect(preparando).toContainText(turno.padStart(2, "0"));
  await expect(listos).not.toContainText(turno.padStart(2, "0"));

  // ── La cocina lo prepara y lo marca listo ────────────────────────────────
  await page.goto("/cocina");
  const comanda = page.locator("article").filter({ hasText: "Bandeja paisa" }).first();
  await comanda.getByRole("button", { name: "Empezar" }).click();
  await expect(comanda.getByRole("button", { name: "Listo" })).toBeVisible();
  await comanda.getByRole("button", { name: "Listo" }).click();

  // Sigue en la pantalla, ahora esperando a que alguien lo lleve: si
  // desapareciera al marcarlo, nadie podría entregarlo nunca.
  await expect(comanda.getByRole("button", { name: "Entregar" })).toBeVisible();

  // ── El televisor ya lo canta ─────────────────────────────────────────────
  await page.goto("/turnero");
  await expect(
    page.locator("section").filter({ hasText: "Listos" }).first(),
  ).toContainText(turno.padStart(2, "0"));
  await expect(page.getByText("Camila")).toBeVisible();

  // ── Se entrega y desaparece de las dos pantallas ─────────────────────────
  await page.goto("/cocina");
  await page
    .locator("article")
    .filter({ hasText: "Bandeja paisa" })
    .first()
    .getByRole("button", { name: "Entregar" })
    .click();
  await expect(page.locator("article").filter({ hasText: "Bandeja paisa" })).toHaveCount(0);

  await page.goto("/turnero");
  await expect(page.locator("li").filter({ hasText: turno.padStart(2, "0") })).toHaveCount(0);

  // Se cobra para no dejar el turno de caja trabado.
  await page.goto("/salon");
  await page.getByRole("link", { name: /camila/i }).click();
  await page.getByRole("button", { name: /registrar pago/i }).click();
  await expect(page.getByText("Pagada").first()).toBeVisible();

  await dejarCajaCerrada(page);
});
