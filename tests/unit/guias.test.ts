import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIAS, guiaPorSlug } from "@/app/(marketing)/guias/guias";
import {
  CONTENIDOS,
  NOMBRE_RELACIONADA,
} from "@/app/(marketing)/guias/_contenidos";

/**
 * Que ninguna guía se publique a medias.
 *
 * El metadato de una guía vive en `guias.ts` y su contenido en `_contenidos/`.
 * Están separados a propósito —el metadato lo consumen el índice, el sitemap y
 * `generateStaticParams`—, y esa separación es justo lo que permite declarar una
 * guía sin escribirla: el índice la lista, el sitemap se la manda a Google, y el
 * enlace lleva a un 404. No falla al compilar ni en ninguna otra prueba.
 */
describe("guías", () => {
  it("cada guía declarada tiene su contenido, y cada contenido su guía", () => {
    const declaradas = GUIAS.map((g) => g.slug).sort();
    const escritas = Object.keys(CONTENIDOS).sort();
    expect(escritas).toEqual(declaradas);
  });

  it("los slugs son únicos y en minúsculas con guiones", () => {
    const slugs = GUIAS.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("guiaPorSlug encuentra las que existen y no inventa las que no", () => {
    expect(guiaPorSlug("propina-en-colombia")?.slug).toBe(
      "propina-en-colombia",
    );
    expect(guiaPorSlug("no-existe")).toBeUndefined();
  });

  /**
   * Google corta la descripción alrededor de los 160 caracteres. Una más larga
   * no es un error —se indexa igual— pero el resultado de búsqueda termina en
   * puntos suspensivos justo donde estaba el argumento. Las cinco nacieron
   * pasadas de largo, así que esto es una regresión que ya ocurrió.
   */
  it("las descripciones entran en un resultado de búsqueda", () => {
    for (const g of GUIAS) {
      expect(
        g.descripcion.length,
        `descripción de ${g.slug}`,
      ).toBeLessThanOrEqual(160);
      expect(g.descripcion.length, `descripción de ${g.slug}`).toBeGreaterThan(
        70,
      );
    }
  });

  it("ningún título ni descripción se repite entre guías", () => {
    expect(new Set(GUIAS.map((g) => g.titulo)).size).toBe(GUIAS.length);
    expect(new Set(GUIAS.map((g) => g.descripcion)).size).toBe(GUIAS.length);
  });

  it("las fechas son fechas, y no están en el futuro", () => {
    for (const g of GUIAS) {
      for (const [campo, valor] of [
        ["publicado", g.publicado],
        ["actualizado", g.actualizado],
      ] as const) {
        expect(valor, `${campo} de ${g.slug}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(valor)), `${campo} de ${g.slug}`).toBe(
          false,
        );
      }
      // Una guía "actualizada" mañana le dice a Google que vuelva por algo que
      // todavía no pasó, que es la misma clase de mentira que el `lastmod` que
      // se generaba solo.
      expect(Date.parse(g.actualizado)).toBeLessThanOrEqual(Date.now());
      expect(Date.parse(g.publicado)).toBeLessThanOrEqual(
        Date.parse(g.actualizado),
      );
    }
  });

  it("la página relacionada de cada guía existe y tiene nombre para mostrar", () => {
    const raiz = process.cwd();
    for (const g of GUIAS) {
      const pagina = join(
        raiz,
        "app",
        "(marketing)",
        g.relacionada,
        "page.tsx",
      );
      expect(() => readFileSync(pagina), `página de ${g.slug}`).not.toThrow();
      expect(
        NOMBRE_RELACIONADA[g.relacionada],
        `nombre de ${g.relacionada}`,
      ).toBeTruthy();
    }
  });
});
