import { CLAVE_DE_PRUEBA, DUENO, PANTALLA_DE_ENTRADA, ingresar } from "./apoyo";
import { expect, test } from "@playwright/test";

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
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill("otra-contrasena-distinta");
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();

  // `.first()`: el mensaje sale DOS veces y está bien que salga dos veces —
  // `defineAction` lo pone en el error del formulario y en el del campo, así que
  // se ve arriba y debajo de "Repetir contraseña".
  await expect(page.getByText(/las contraseñas no coinciden/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/registro$/);
});

test("el ojo de la contraseña alterna entre ocultarla y mostrarla", async ({ page }) => {
  await page.goto("/ingresar");
  const campo = page.getByLabel("Contraseña", { exact: true });
  await expect(campo).toHaveAttribute("type", "password");

  /**
   * Se reintenta: el ojo es `useState`, así que un clic anterior a la hidratación
   * no hace nada y no avisa. Es la misma trampa que documenta AGENTS.md para
   * `<form action={serverAction}>`, y acá se ve igual de callada.
   */
  const alternar = async (boton: string, tipoEsperado: string) => {
    for (let intento = 0; intento < 5; intento++) {
      await page.getByRole("button", { name: boton }).click();
      try {
        await expect(campo).toHaveAttribute("type", tipoEsperado, { timeout: 3000 });
        return;
      } catch {
        // El clic cayó antes de la hidratación: se vuelve a intentar.
      }
    }
    throw new Error(`El botón "${boton}" no dejó el campo en type="${tipoEsperado}".`);
  };

  await alternar("Mostrar contraseña", "text");
  await alternar("Ocultar contraseña", "password");
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
  await page.getByLabel(/contraseña nueva/i).fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill(CLAVE_DE_PRUEBA);
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
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill(CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

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
