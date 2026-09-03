import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * El SQL crudo, y por qué esto es un test y no solo una regla de lint.
 *
 * Prisma protege de la inyección mientras se le hable por el ORM o por la
 * plantilla etiquetada (`$queryRaw\`...\``), que manda cada `${valor}` como
 * parámetro. Las que no protegen son `$queryRawUnsafe`, `$executeRawUnsafe` y
 * `Prisma.raw`: reciben una cadena, y lo que se haya pegado ahí se ejecuta.
 *
 * `eslint.config.mjs` ya las rechaza. Este test lo vuelve a afirmar porque el
 * lint se saltea —con un `--no-eslintrc`, con un `// eslint-disable` de más, o
 * simplemente no corriéndolo— y esto corre con `pnpm test`. Es el mismo criterio
 * de `tenant-scope.test.ts` y `robots.test.ts`: la invariante que sostiene la
 * seguridad se escribe como prueba.
 */

/** Los archivos versionados que podrían hablar SQL. */
function archivosDeCodigo(): string[] {
  // `--others --exclude-standard` suma los archivos nuevos que todavía no se
  // agregaron a git, respetando el .gitignore (o sea sin generated/ ni .next/).
  // Sin eso, quien escribe hoy un $queryRawUnsafe y corre `pnpm test` antes de
  // hacer `git add` pasa en verde, y el test solo lo agarraría en CI —tarde, y
  // en la pantalla de otro—.
  const salida = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "app",
      "features",
      "lib",
      "scripts",
      "prisma",
    ],
    { encoding: "utf8" },
  );
  return salida
    .split("\n")
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // Este mismo archivo nombra las formas prohibidas para poder prohibirlas.
    .filter((f) => !f.endsWith("tests/unit/sql-crudo.test.ts"));
}

const archivos = archivosDeCodigo().map((ruta) => ({
  ruta,
  contenido: readFileSync(ruta, "utf8"),
}));

describe("SQL crudo", () => {
  it("encuentra archivos para revisar", () => {
    // Sin esto, un `git ls-files` que falle dejaría la suite en verde sin haber
    // mirado nada, que es la peor forma de pasar.
    expect(archivos.length).toBeGreaterThan(100);
  });

  it("no usa ninguna de las formas que aceptan una cadena armada a mano", () => {
    const prohibidas: [string, RegExp][] = [
      ["$queryRawUnsafe", /\$queryRawUnsafe/],
      ["$executeRawUnsafe", /\$executeRawUnsafe/],
      ["Prisma.raw", /\bPrisma\.raw\b/],
    ];

    // El mensaje nombra el archivo y la forma: un `expect(false).toBe(true)`
    // dejaría a quien lo rompa buscando a mano en cuatro carpetas.
    const culpables = archivos.flatMap(({ ruta, contenido }) =>
      prohibidas.filter(([, forma]) => forma.test(contenido)).map(([nombre]) => `${ruta} usa ${nombre}`),
    );

    expect(culpables).toEqual([]);
  });

  it("todo $queryRaw y $executeRaw es plantilla etiquetada, nunca una llamada", () => {
    // La diferencia entera está en el carácter que sigue al método: un backtick
    // parametriza, un paréntesis recibe una cadena ya armada. Se ven casi igual
    // en una revisión y no se parecen en nada al ejecutarse.
    const comoLlamada = /\$(?:query|execute)Raw\s*\(/;

    const culpables = archivos
      .filter(({ contenido }) => comoLlamada.test(contenido))
      .map(({ ruta }) => ruta);

    expect(culpables).toEqual([]);
  });

  it("las consultas crudas que hay siguen acotando por businessId", () => {
    // `tenantDb` no alcanza al SQL crudo —lo dice lib/db/tenant.ts— así que en
    // esas dos consultas el businessId va a mano en el WHERE. Si alguien las
    // edita y lo saca, un informe pasa a mostrar los pedidos de otros negocios.
    const informes = readFileSync("features/informes/queries.ts", "utf8");

    // El punto de adelante es lo que distingue una llamada de una mención: el
    // archivo habla de `$queryRaw` en sus comentarios, y sin esto el test se
    // pondría a buscarle un WHERE a un párrafo.
    const crudas = informes
      .split(/\.\$(?:query|execute)Raw/)
      .slice(1)
      .map((trozo) => trozo.slice(0, trozo.indexOf("`;")));

    expect(crudas).toHaveLength(2);
    for (const consulta of crudas) {
      expect(consulta).toMatch(/"businessId"\s*=\s*\$\{businessId\}/);
    }
  });
});
