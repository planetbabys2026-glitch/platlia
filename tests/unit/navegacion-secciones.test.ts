import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construirNavegacion } from "@/app/(app)/navegacion";

/**
 * El menú y la pantalla tienen que coincidir.
 *
 * Es la misma razón por la que `seccionesDeCaja()` y `vistaInicialDeCaja()` viven
 * juntas: si divergen, el enlace del menú lleva a una pantalla que no se dibuja, y
 * nada falla —ni el build, ni el tipo, ni el lint—. Pasó de verdad con "Conexión
 * con IA": la sección quedó escrita en el panel y no en el menú, así que la vista
 * existía y no había forma de llegar a ella salvo tecleando el `?vista=` a mano.
 *
 * Se lee el archivo como TEXTO en vez de importarlo porque `panel-configuracion`
 * es un componente cliente que arrastra media aplicación; acá solo hace falta la
 * lista de vistas que declara.
 */

const RAIZ = join(__dirname, "..", "..");

function vistasQueDibujaElPanel(): string[] {
  const fuente = readFileSync(
    join(RAIZ, "app/(app)/administracion/configuracion/panel-configuracion.tsx"),
    "utf8",
  );
  const m = fuente.match(/useVistaEnUrl<TabId>\(\s*"vista",\s*\[([^\]]+)\]/);
  if (!m) throw new Error("No se encontró la lista de vistas de panel-configuracion.tsx");
  return [...m[1]!.matchAll(/"([^"]*)"/g)].map((x) => x[1]!);
}

function seccionesDeConfiguracion(): string[] {
  const { configuracion } = construirNavegacion({
    usaMesas: true,
    usaCocina: true,
    usaDomicilios: true,
    puedeVerInventario: true,
    puedeFacturar: true,
    esPropietario: true,
    role: "PROPIETARIO",
    rolePermissions: null,
    comandasVivas: 0,
    domiciliosActivos: 0,
    cuentasPorCobrar: 0,
  });
  if (!configuracion?.secciones) throw new Error("Configuración no declara secciones en el menú");
  // El menú escribe "" para la de entrada; el panel la llama por su nombre.
  return configuracion.secciones.map((s) => (s.vista === "" ? "datos" : s.vista));
}

describe("las secciones del menú y las vistas de la pantalla no pueden divergir", () => {
  it("cada sección de Configuración en el menú se dibuja en el panel", () => {
    const delPanel = vistasQueDibujaElPanel();
    for (const vista of seccionesDeConfiguracion()) {
      expect(delPanel, `el menú enlaza "?vista=${vista}" y el panel no la dibuja`).toContain(vista);
    }
  });

  it("cada vista que dibuja el panel se puede alcanzar desde el menú", () => {
    const delMenu = seccionesDeConfiguracion();
    for (const vista of vistasQueDibujaElPanel()) {
      expect(delMenu, `el panel dibuja "${vista}" y no hay forma de llegar desde el menú`).toContain(
        vista,
      );
    }
  });
});
