import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function buscarArchivosTsx(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next" || entrada === "generated") continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) buscarArchivosTsx(ruta, acc);
    else if (/\.tsx$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

describe("orden semántico de los encabezados (regla axe/heading-order)", () => {
  it("ningún componente de marketing omite niveles de encabezados", () => {
    const archivos = buscarArchivosTsx(join(RAIZ, "app/(marketing)"));
    const errores: string[] = [];

    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, "utf8");
      // Extrae la secuencia de etiquetas de encabezado en el orden en que aparecen
      const coincidencias = [...contenido.matchAll(/<h([1-6])[\s>]/g)];
      const niveles = coincidencias.map((m) => parseInt(m[1]!, 10));

      let maxNivelAlcanzado = 0;
      for (let i = 0; i < niveles.length; i++) {
        const nivelActual = niveles[i]!;
        if (nivelActual > maxNivelAlcanzado + 1 && maxNivelAlcanzado !== 0) {
          errores.push(
            `${archivo.slice(RAIZ.length + 1)}: salto de h${maxNivelAlcanzado} a h${nivelActual}`,
          );
        }
        if (nivelActual > maxNivelAlcanzado) {
          maxNivelAlcanzado = nivelActual;
        }
      }
    }

    expect(errores).toEqual([]);
  });
});
