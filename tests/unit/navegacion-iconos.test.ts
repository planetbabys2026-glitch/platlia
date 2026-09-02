import { describe, expect, it } from "vitest";
import { construirNavegacion, ICONO_ADMINISTRACION } from "@/app/(app)/navegacion";
import type { Role } from "@/generated/prisma/enums";

/**
 * Dos destinos distintos no pueden compartir icono.
 *
 * No es prolijidad: la barra de escritorio colapsada es un **riel de iconos** y
 * la barra inferior del teléfono también, así que ahí el icono es todo lo que
 * hay para distinguir un destino de otro. Cuando esto se rompió, se rompió tres
 * veces a la vez y ninguna falló nada —ni el build, ni el tipo, ni el lint—:
 *
 * - Configuración y Modificadores usaban los dos `SlidersHorizontal`.
 * - Administración y Configuración usaban los dos `Settings`.
 * - Configuración tenía UN icono para el propietario y OTRO para quien no lo es:
 *   la misma pantalla cambiaba de dibujo según quién la mirara.
 *
 * Se compara por título porque el título es el destino. La única repetición
 * legítima es la de dos entradas con el MISMO nombre —"Salón" en Operación y en
 * Administración son la misma cosa vista desde dos lados—, y por eso la
 * comparación agrupa por título en vez de exigir unicidad renglón por renglón.
 */

const TODO_ENCENDIDO = {
  usaMesas: true,
  usaCocina: true,
  usaDomicilios: true,
  usaTurnero: true,
  usaCredito: true,
  usaInventario: true,
  usaRecetas: true,
  puedeVerInventario: true,
  puedeFacturar: true,
  esPropietario: true,
  role: "PROPIETARIO" as Role,
  rolePermissions: null,
  comandasVivas: 0,
  domiciliosActivos: 0,
  cuentasPorCobrar: 0,
  deudores: 0,
};

/** Todo lo que el menú puede pintar, con su icono. */
function destinos(extra: Partial<typeof TODO_ENCENDIDO> = {}) {
  const nav = construirNavegacion({ ...TODO_ENCENDIDO, ...extra });
  return [
    ...nav.grupos.flatMap((g) => g.items),
    ...nav.administracion,
    ...(nav.configuracion ? [nav.configuracion] : []),
  ]
    .map((i) => ({ titulo: i.titulo, icono: i.icono }))
    // El acordeón de Administración es un destino más del riel y su icono ya
    // chocó una vez con el de Configuración, así que entra a la comparación.
    .concat(
      nav.administracion.length > 0
        ? [{ titulo: "Administración", icono: ICONO_ADMINISTRACION }]
        : [],
    );
}

describe("los iconos del menú identifican un destino y solo uno", () => {
  it("dos destinos con nombres distintos no comparten icono", () => {
    const porIcono = new Map<unknown, Set<string>>();
    for (const d of destinos()) {
      const titulos = porIcono.get(d.icono) ?? new Set<string>();
      titulos.add(d.titulo);
      porIcono.set(d.icono, titulos);
    }

    const colisiones = [...porIcono.values()]
      .filter((titulos) => titulos.size > 1)
      .map((titulos) => [...titulos].join(" / "));

    expect(colisiones, `estos destinos se ven idénticos en el riel: ${colisiones.join("; ")}`).toEqual(
      [],
    );
  });

  it("cada destino trae un icono: en el riel no hay texto que lo supla", () => {
    for (const d of destinos()) {
      expect(d.icono, `"${d.titulo}" no declara icono`).toBeTruthy();
    }
  });

  it("Configuración se ve igual la mire quien la mire", () => {
    const delPropietario = destinos().find((d) => d.titulo === "Configuración");
    const delOtro = destinos({ esPropietario: false, role: "ADMINISTRADOR" }).find(
      (d) => d.titulo === "Configuración",
    );
    expect(delPropietario?.icono).toBeTruthy();
    expect(delOtro?.icono).toBe(delPropietario?.icono);
  });
});
