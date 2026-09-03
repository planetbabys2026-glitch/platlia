import { expect, test } from "@playwright/test";
import { PANTALLA_DE_ENTRADA } from "./apoyo";
import { CLAVE_SEMILLA } from "@/prisma/datos-semilla";

/**
 * Licencia y cobro.
 *
 * El webhook se prueba como lo que es: una URL pública que mueve el estado de la
 * licencia. Lo que importa acá no es que funcione el pago —para eso hacen falta
 * credenciales de MercadoPago— sino que **no se pueda mover la licencia sin una
 * firma válida**, que es la parte que un atacante ataca.
 */

const DUENO = { email: "dueno@platlia.com", password: CLAVE_SEMILLA };

test.describe("webhook de MercadoPago", () => {
  test("no queda detrás del login: responde por su cuenta", async ({ request }) => {
    // Si el middleware lo mandara a /ingresar, MercadoPago recibiría un 307 y el
    // pago no se aplicaría nunca.
    const respuesta = await request.post("/api/webhooks/mercadopago", {
      data: { type: "payment", data: { id: "123" } },
      maxRedirects: 0,
    });

    expect(respuesta.status()).not.toBe(307);
    expect([200, 400, 401]).toContain(respuesta.status());
  });

  test("rechaza un aviso sin firma", async ({ request }) => {
    const respuesta = await request.post("/api/webhooks/mercadopago?data.id=123", {
      data: { type: "payment", data: { id: "123" }, id: 987 },
    });

    expect(respuesta.status()).toBe(401);
    expect(await respuesta.json()).toMatchObject({ error: "firma inválida" });
  });

  test("rechaza una firma inventada", async ({ request }) => {
    const respuesta = await request.post("/api/webhooks/mercadopago?data.id=123", {
      headers: {
        "x-signature": "ts=1754400000,v1=00000000000000000000000000000000",
        "x-request-id": "req-falso",
      },
      data: { type: "payment", data: { id: "123" }, id: 988 },
    });

    expect(respuesta.status()).toBe(401);
  });

  test("un cuerpo ilegible no tumba la ruta", async ({ request }) => {
    const respuesta = await request.post("/api/webhooks/mercadopago", {
      headers: { "content-type": "application/json" },
      data: "esto no es json",
    });

    expect([400, 401]).toContain(respuesta.status());
  });
});

test("la pantalla de facturación muestra el estado de la licencia", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(DUENO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(DUENO.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  await page.goto("/facturacion");

  await expect(page.getByRole("heading", { name: "Facturación" })).toBeVisible();

  /**
   * El monto NO se clava.
   *
   * Esto fijaba "$50.000" en dos lugares, y desde que el precio salió del código
   * y vive en `ListaDePrecios` —que edita el superadministrador— eso es afirmar
   * el contenido de una tabla: se cambia la tarifa y la prueba se pone roja sin
   * que nada se haya roto. Y peor, una promoción la rompe sola. Lo que sí tiene
   * que ser cierto siempre es que la pantalla muestre una tarifa mensual y que el
   * botón cobre ESA misma cifra, que es la coherencia que el módulo promete.
   */
  const mensual = page.getByText(/al mes/).first();
  await expect(mensual).toContainText(/\$[\d.]+/);

  const cifra = /\$[\d.]+/.exec((await mensual.textContent()) ?? "")?.[0] ?? "";
  expect(cifra).not.toBe("");
  const escapada = cifra.replace(/[$.]/g, (c) => "\\" + c);
  await expect(page.getByRole("button", { name: new RegExp(`pagar ${escapada}`, "i") })).toBeVisible();

  // El enlace desde la pantalla de licencia vencida ya no muere en un 404.
  const respuesta = await page.request.get("/facturacion");
  expect(respuesta.status()).toBe(200);
});
