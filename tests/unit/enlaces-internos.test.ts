import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ningún enlace del producto apunta a una pantalla que no existe.
 *
 * Existe porque había uno: el botón de la pestaña Recetas del inventario decía
 * "Gestionar Menú y Platos" y apuntaba a `/administracion/menu`, una ruta que
 * nunca existió —la pantalla es `/administracion/carta`—. Un `<Link>` roto no
 * falla al compilar ni en ninguna prueba: falla el día que alguien lo toca y se
 * come un 404, y hasta entonces nadie se entera.
 *
 * Se recorre el árbol de `app/` para armar la lista de rutas reales, así que
 * mover o borrar una pantalla hace fallar esto en vez de dejar enlaces colgando.
 */

const RAIZ = process.cwd();

/** Los archivos de código donde puede haber un `href`. */
function archivos(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (
      entrada === "node_modules" ||
      entrada === ".next" ||
      entrada === "generated"
    )
      continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivos(ruta, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

/**
 * De la carpeta a la URL: los grupos `(app)` no generan segmento y una carpeta
 * que empieza con `_` es privada. Los segmentos dinámicos se dejan como `[id]`
 * para poder compararlos por forma.
 */
function rutasReales(): Set<string> {
  const rutas = new Set<string>(["/"]);
  for (const archivo of archivos(join(RAIZ, "app"))) {
    if (!/[/\\]page\.tsx$/.test(archivo)) continue;
    const relativo = archivo
      .slice(join(RAIZ, "app").length)
      .replace(/[/\\]page\.tsx$/, "");
    const segmentos = relativo
      .split(/[/\\]/)
      .filter((s) => s && !s.startsWith("(") && !s.startsWith("_"));
    rutas.add("/" + segmentos.join("/"));
  }
  return rutas;
}

/** Un `href` con partes dinámicas no se puede comparar contra una ruta fija. */
function comparable(href: string): boolean {
  return href.startsWith("/") && !href.includes("${") && !href.includes("[");
}

/**
 * Una URL concreta puede estar cubierta por una ruta dinámica.
 *
 * `/guias/propina-en-colombia` no aparece como carpeta —la ruta es
 * `/guias/[slug]`—, pero el enlace es válido: es una instancia de ese patrón.
 * Sin esto, enlazar a una guía desde otra se reportaba como enlace roto y la
 * única salida era no enlazarlas, que es justo lo contrario de lo que hay que
 * hacer. Se compara segmento a segmento y `[algo]` acepta cualquier valor.
 */
function cubiertaPorRutaDinamica(href: string, rutas: Set<string>): boolean {
  const partes = href.split("/").filter(Boolean);

  return [...rutas].some((patron) => {
    const suyas = patron.split("/").filter(Boolean);
    if (suyas.length !== partes.length) return false;
    return suyas.every(
      (seg, i) =>
        (seg.startsWith("[") && seg.endsWith("]")) || seg === partes[i],
    );
  });
}

describe("los enlaces internos llevan a alguna parte", () => {
  it("no hay ningún href que apunte a una ruta inexistente", () => {
    const rutas = rutasReales();
    const rotos: string[] = [];

    for (const carpeta of ["app", "features", "components"]) {
      for (const archivo of archivos(join(RAIZ, carpeta))) {
        const codigo = readFileSync(archivo, "utf8");
        for (const m of codigo.matchAll(/href="(\/[^"]*)"/g)) {
          const href = m[1]!;
          if (!comparable(href)) continue;
          // La sección viaja en `?vista=` y el ancla en `#`: la pantalla es la
          // parte de antes de las dos.
          const base = href.split(/[?#]/)[0]!.replace(/\/$/, "") || "/";
          if (!rutas.has(base) && !cubiertaPorRutaDinamica(base, rutas)) {
            rotos.push(`${archivo.slice(RAIZ.length + 1)} → ${href}`);
          }
        }
      }
    }

    expect(rotos).toEqual([]);
  });
});
