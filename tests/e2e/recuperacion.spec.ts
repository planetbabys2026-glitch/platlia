import { expect, test } from "@playwright/test";
import { DUENO, ingresar } from "./apoyo";

/**
 * Verificación de correo y recuperación de contraseña.
 *
 * El token de verdad —el que va en el enlace del correo— no se puede obtener
 * desde acá: solo se guarda su hash, y el correo mismo no pasa por esta suite.
 * Lo que sí se puede probar de punta a punta, sin tocar una bandeja de entrada,
 * es todo lo demás: que el formulario no deja mandar contraseñas que no
 * coinciden, que "recuperar" contesta lo mismo exista o no la cuenta, que un
 * enlace inventado o ausente da el error correcto, y que el aviso del panel
 * aparece y desaparece con el estado real de la cuenta.
 */
test.describe.configure({ mode: "serial" });

test("el registro no deja mandar contraseñas que no coinciden", async ({ page }) => {
  const sufijo = Date.now().toString(36);

  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Prueba Contraseñas");
  await page.getByLabel("Nombre del negocio").fill(`Bar Contraseñas ${sufijo}`);
  await page.getByLabel("Correo").fill(`no-coincide-${sufijo}@platlia.test`);
  await page.getByLabel("Contraseña", { exact: true }).fill("contrasenasegura");
  await page.getByLabel("Repetir contraseña").fill("otra-contrasena-distinta");
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();

  await expect(page.getByText(/las contraseñas no coinciden/i)).toBeVisible();
  await expect(page).toHaveURL(/\/registro$/);
});

test("el ojo de la contraseña alterna entre ocultarla y mostrarla", async ({ page }) => {
  await page.goto("/ingresar");
  const campo = page.getByLabel("Contraseña", { exact: true });
  await expect(campo).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(campo).toHaveAttribute("type", "text");

  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(campo).toHaveAttribute("type", "password");
});

test("recuperar contesta lo mismo exista o no la cuenta", async ({ page }) => {
  await page.goto("/recuperar");
  await page.getByLabel("Correo").fill(DUENO.email);
  await page.getByRole("button", { name: /mandar instrucciones/i }).click();
  const mensajeConCuenta = await page
    .getByText(/si ese correo tiene una cuenta/i)
    .textContent();

  await page.goto("/recuperar");
  await page.getByLabel("Correo").fill("nadie-tiene-esta-cuenta@platlia.test");
  await page.getByRole("button", { name: /mandar instrucciones/i }).click();
  const mensajeSinCuenta = await page
    .getByText(/si ese correo tiene una cuenta/i)
    .textContent();

  expect(mensajeConCuenta).toBe(mensajeSinCuenta);
});

test("restablecer sin token en la URL avisa que el enlace no es válido", async ({ page }) => {
  await page.goto("/restablecer-contrasena");
  await expect(page.getByText(/ese enlace no es válido/i)).toBeVisible();
  // Sin token no hay formulario que llenar.
  await expect(page.getByLabel(/contraseña nueva/i)).toHaveCount(0);
});

test("restablecer con un token inventado lo rechaza en el servidor", async ({ page }) => {
  await page.goto("/restablecer-contrasena?token=esto-no-es-un-token-valido");
  await page.getByLabel(/contraseña nueva/i).fill("contrasenanueva1");
  await page.getByLabel("Repetir contraseña").fill("contrasenanueva1");
  await page.getByRole("button", { name: /guardar contraseña/i }).click();

  await expect(page.getByText(/ese enlace venció o no es válido/i)).toBeVisible();
});

test("verificar correo sin token, o con uno inventado, avisa que no es válido", async ({
  page,
}) => {
  await page.goto("/verificar-correo");
  await expect(page.getByText(/ese enlace no es válido/i)).toBeVisible();

  await page.goto("/verificar-correo?token=esto-tampoco-es-valido");
  await expect(page.getByText(/ese enlace no es válido/i)).toBeVisible();
});

test("un negocio recién registrado ve el aviso de correo sin confirmar", async ({ page }) => {
  const sufijo = Date.now().toString(36);
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Prueba Verificación");
  await page.getByLabel("Nombre del negocio").fill(`Bar Verificación ${sufijo}`);
  await page.getByLabel("Correo").fill(`verificacion-${sufijo}@platlia.test`);
  await page.getByLabel("Contraseña", { exact: true }).fill("contrasenasegura");
  await page.getByLabel("Repetir contraseña").fill("contrasenasegura");
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();
  await expect(page).toHaveURL(/\/panel$/);

  // CardTitle es un <div>, no un heading semántico —igual que la tarjeta de
  // "licencia venció" que ya vive en esta misma página—, así que se busca por
  // texto y no por rol.
  await expect(page.getByText("Confirmá tu correo")).toBeVisible();
});

test("la cuenta sembrada ya tiene el correo confirmado: no ve el aviso", async ({ page }) => {
  // Contexto de navegador propio de este test: no arrastra la sesión que dejó
  // el registro del test anterior, así que /ingresar muestra el formulario en
  // vez de rebotar a /panel por ya haber sesión.
  await ingresar(page, DUENO);
  await page.goto("/panel");
  await expect(page.getByText("Confirmá tu correo")).toHaveCount(0);
});
