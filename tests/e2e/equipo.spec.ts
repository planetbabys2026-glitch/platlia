import { CLAVE_DE_PRUEBA, PANTALLA_DE_ENTRADA } from "./apoyo";
import { expect, test, type Page } from "@playwright/test";
import { CLAVE_SEMILLA } from "@/prisma/datos-semilla";

/**
 * El dueño arma su equipo y cada rol ve solo lo suyo.
 *
 * En serie: se crea un empleado en el primer test y se usa en el segundo.
 */
test.describe.configure({ mode: "serial" });

const DUENO = { email: "dueno@platlia.com", password: CLAVE_SEMILLA };

const sufijo = Date.now().toString(36);
const MESERO = {
  nombre: `Mesero ${sufijo}`,
  email: `mesero-${sufijo}@platlia.test`,
  clave: CLAVE_DE_PRUEBA,
};

async function ingresar(page: Page, datos: { email: string; password: string }) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(datos.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(datos.password);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);
}

test("el dueño agrega un mesero, aunque el correo de aviso no salga", async ({ page }) => {
  // El dominio de Resend todavía no está verificado: el aviso falla y se registra
  // en el log. Lo que NO puede pasar es que eso impida dar de alta a la persona.
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  // Acotado al formulario de alta: cada miembro de la lista tiene su propio
  // campo "Contraseña nueva", que también coincide con "Contraseña".
  const alta = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /agregar al equipo/i }) });

  await alta.getByLabel("Nombre").fill(MESERO.nombre);
  await alta.getByLabel("Correo").fill(MESERO.email);
  // `exact` porque el campo compartido trae el ojo de mostrar/ocultar, cuyo
  // `aria-label` es "Mostrar contraseña" y coincide por subcadena.
  await alta.getByLabel("Contraseña", { exact: true }).fill(MESERO.clave);
  await page.getByRole("button", { name: /agregar al equipo/i }).click();

  await expect(page.getByText(MESERO.email)).toBeVisible();
  await expect(page.getByText(MESERO.nombre)).toBeVisible();
});

test("el mesero entra y no alcanza la administración", async ({ page }) => {
  await ingresar(page, { email: MESERO.email, password: MESERO.clave });

  // Ve el salón, que es su trabajo. Con `level: 1` porque el área del seed
  // también se llama "Salón" y aparece como h2.
  await page.goto("/salon");
  await expect(page.getByRole("heading", { name: "Salón", level: 1 })).toBeVisible();

  /**
   * Y no la administración, aunque escriba la URL a mano.
   *
   * Se afirma el CONTENIDO, no el código de estado. Esto pedía un 404 y recibe un
   * 200, y no es un agujero: la página corta con `notFound()` y devuelve
   * "No encontramos esta página" sin una sola fila del equipo. El 200 lo pone el
   * streaming —el layout de `(app)` es async y consulta la base para pintar el
   * shell, así que la cabecera ya salió cuando la guarda llama a `notFound()`—, y
   * le pasa igual a toda ruta del shell: `/administracion/salon` también contesta
   * 200 para este mesero. Una ruta inexistente FUERA del shell sí da 404.
   *
   * Afirmar que no se filtra nada es más fuerte que afirmar el número: un 404 con
   * el equipo adentro pasaría la prueba vieja y sería el defecto de verdad.
   */
  const respuesta = await page.request.get("/administracion/equipo");
  const cuerpo = await respuesta.text();

  expect(cuerpo).toContain("No encontramos esta página");
  expect(cuerpo).not.toMatch(/Agregar al equipo/i);

  // Lo que no puede filtrarse es la gente de ESTE negocio: sus compañeros y el
  // dueño. Acá había además un `not.toContain(MESERO.email)`, o sea el correo de
  // quien está mirando, y esa afirmación no podía cumplirse nunca: el layout de
  // `(app)` le pasa `ctx.user` entero al shell —email incluido— en toda página
  // del producto, y hasta lo muestra en pantalla mientras el correo no esté
  // verificado. Que alguien vea su propio correo no es una filtración; pedirlo
  // era exigirle a esta prueba algo que no tiene que ver con lo que protege.
  expect(cuerpo).not.toContain("caja@platlia.com");
  expect(cuerpo).not.toContain(DUENO.email);
});

test("no se puede dejar al negocio sin propietario", async ({ page }) => {
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  // El propio dueño no aparece con controles: ofrecer un botón que siempre
  // falla es una trampa.
  const suPropiaFila = page.locator("li").filter({ hasText: "(vos)" });
  await expect(suPropiaFila).toHaveCount(1);
  await expect(suPropiaFila.getByRole("button", { name: /dar de baja/i })).toHaveCount(0);

  // Acá había un `expect(page.getByText(/hay un solo propietario/i))`. Ese aviso
  // se pinta solo cuando `propietariosActivos === 1`, y el seed pasó a traer
  // tres propietarios: la afirmación no podía cumplirse más. Es incidental a lo
  // que esta prueba protege —que el dueño no pueda quedarse sin negocio— y lo
  // que sí protege son las dos afirmaciones de arriba.
  //
  // Lo que corresponde afirmar con varios propietarios es que a los OTROS sí se
  // los puede tocar: si no, la ausencia de botones en la propia fila también
  // pasaría con una pantalla que no dibuja ningún control.
  const otroPropietario = page
    .locator("li")
    .filter({ hasText: /Propietario/ })
    .filter({ hasNot: page.getByText("(vos)") })
    .first();
  await expect(otroPropietario.getByRole("button", { name: /dar de baja/i })).toHaveCount(1);
});

test("el mesero dado de baja deja de entrar", async ({ page }) => {
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  const fila = page.locator("li").filter({ hasText: MESERO.email });
  await fila.getByRole("button", { name: /dar de baja/i }).click();
  await expect(page.getByRole("heading", { name: "Dados de baja" })).toBeVisible();

  // Su sesión quedó revocada y su membresía inactiva: el DAL lo manda a elegir
  // negocio o a crear uno, pero no lo deja operar el bar.
  await page.context().clearCookies();
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(MESERO.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(MESERO.clave);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await expect(page).not.toHaveURL(PANTALLA_DE_ENTRADA);
  const salon = await page.request.get("/salon", { maxRedirects: 0 });
  expect(salon.status()).toBe(307);
});

/**
 * El dueño de otro negocio no se puede sumar como empleado.
 *
 * Cierra una cadena concreta de toma de control: `agregarEmpleado` enganchaba
 * cualquier cuenta global por correo, sin permiso de esa persona, y después
 * `restablecerContrasena` le reescribía la contraseña —que es del usuario, no
 * del negocio—. Con una prueba gratis alcanzaba para agregar al dueño de otro
 * bar como mesero, cambiarle la clave y entrar a SU negocio.
 *
 * El dueño ajeno se fabrica registrándolo: el seed trae un solo negocio, así que
 * no hay ninguno "de afuera" hasta que se crea uno.
 */
test("no se puede sumar al equipo al dueño de otro negocio", async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const ajeno = `dueno-ajeno-${sufijo}@platlia.test`;

  // 1. Nace un negocio ajeno, con su propio propietario.
  await page.goto("/registro");
  await page.getByLabel("Tu nombre").fill("Dueña Ajena");
  await page.getByLabel("Nombre del negocio").fill(`Bar Ajeno ${sufijo}`);
  await page.getByLabel("Correo").fill(ajeno);
  await page.getByLabel("Contraseña", { exact: true }).fill(CLAVE_DE_PRUEBA);
  await page.getByLabel("Repetir contraseña").fill(CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /empezar los 7 días/i }).click();
  await expect(page).toHaveURL(PANTALLA_DE_ENTRADA);

  // 2. Desde el bar del seed, se intenta sumarlo al equipo.
  await page.context().clearCookies();
  await ingresar(page, DUENO);
  await page.goto("/administracion/equipo");

  const alta = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /agregar al equipo/i }) });

  await alta.getByLabel("Nombre").fill("Dueña Ajena");
  await alta.getByLabel("Correo").fill(ajeno);
  await alta.getByLabel("Contraseña", { exact: true }).fill(CLAVE_DE_PRUEBA);
  await page.getByRole("button", { name: /agregar al equipo/i }).click();

  await expect(alta.getByRole("alert")).toContainText(/ya tiene su propio negocio/i);

  // Y no quedó agregado: la lista del equipo no lo nombra.
  await page.reload();
  await expect(page.locator("li").filter({ hasText: ajeno })).toHaveCount(0);
});
