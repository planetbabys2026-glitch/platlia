import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUTAS_PUBLICAS } from "@/app/(marketing)/rutas";
import { GUIAS } from "@/app/(marketing)/guias/guias";

/**
 * El sitemap dice la verdad.
 *
 * `app/sitemap.ts` no se puede importar acá: arrastra `lib/env.ts`, que revienta
 * a propósito cuando hay `window` definido y los tests corren en jsdom. Así que
 * lo que se puede comprobar por importación —las dos listas— se comprueba así, y
 * el cableado del archivo se lee como texto, que es el mismo recurso que usa
 * `navegacion-secciones.test.ts` por la misma razón.
 */
const SITEMAP = readFileSync(join(process.cwd(), "app", "sitemap.ts"), "utf8");

/**
 * El archivo sin sus comentarios.
 *
 * Hace falta porque el propio comentario que explica el defecto contiene la
 * expresión que se está prohibiendo, y sin esto la prueba se dispara con su
 * documentación en vez de con el código.
 */
const CODIGO = SITEMAP.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /\/\/.*$/gm,
  "",
);

describe("sitemap", () => {
  /**
   * La regresión que motivó todo esto: `const ahora = new Date()` se evaluaba en
   * cada petición, así que las cinco URLs declaraban "modificada ahora mismo"
   * siempre. Google descarta los `lastmod` que detecta poco fiables, con lo cual
   * el campo dejaba de servir para lo único que sirve.
   */
  it("no genera la fecha al vuelo", () => {
    expect(CODIGO).not.toMatch(/new Date\(\s*\)/);
  });

  it("se arma desde las dos listas, no con rutas copiadas a mano", () => {
    expect(SITEMAP).toContain("RUTAS_PUBLICAS");
    expect(SITEMAP).toContain("GUIAS");
  });

  it("cada ruta pública corresponde a una página que existe", () => {
    const raiz = process.cwd();
    for (const { ruta } of RUTAS_PUBLICAS) {
      // La portada y las rutas de otros grupos se resuelven fuera de (marketing).
      const candidatas = [
        join(raiz, "app", "(marketing)", ruta === "/" ? "" : ruta, "page.tsx"),
        join(raiz, "app", "(auth)", ruta, "page.tsx"),
      ];
      expect(
        candidatas.some((c) => existsSync(c)),
        `no existe la página de ${ruta}`,
      ).toBe(true);
    }
  });

  it("las fechas son válidas y no están en el futuro", () => {
    for (const { ruta, actualizado } of RUTAS_PUBLICAS) {
      expect(actualizado, ruta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(actualizado), ruta).toBeLessThanOrEqual(Date.now());
    }
  });

  it("no hay rutas repetidas y las prioridades son válidas", () => {
    const rutas = RUTAS_PUBLICAS.map((r) => r.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const { ruta, prioridad } of RUTAS_PUBLICAS) {
      expect(prioridad, ruta).toBeGreaterThan(0);
      expect(prioridad, ruta).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Las páginas por las que se quiere aparecer tienen que estar sí o sí: son las
   * únicas comerciales del sitio y publicarlas sin listarlas es dejarlas
   * dependiendo de que un rastreador las descubra por un enlace.
   */
  it("están las páginas comerciales y el índice de guías", () => {
    const rutas = RUTAS_PUBLICAS.map((r) => r.ruta);
    for (const esperada of [
      "/",
      "/software-para-restaurantes",
      "/software-para-bares",
      "/precios",
      "/guias",
    ]) {
      expect(rutas, `falta ${esperada} en el sitemap`).toContain(esperada);
    }
  });

  it("las guías no se listan a mano en RUTAS_PUBLICAS", () => {
    // Entran solas desde `GUIAS`. Listarlas en los dos lados es la forma de que
    // un día aparezcan duplicadas en el XML.
    const rutas = RUTAS_PUBLICAS.map((r) => r.ruta);
    for (const g of GUIAS) expect(rutas).not.toContain(`/guias/${g.slug}`);
  });
});
