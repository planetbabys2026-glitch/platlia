import { describe, expect, it } from "vitest";
import {
  construirNavegacion,
  hrefDeSeccion,
  seccionesDeCaja,
  vistaInicialDeCaja,
} from "@/app/(app)/navegacion";

describe("navegación y submenús con insignias", () => {
  it("seccionesDeCaja asigna la insignia de cuentasPorCobrar a 'Cobrar cuentas' cuando el negocio cobra cuentas", () => {
    const seccionesConMesas = seccionesDeCaja(true, 3);
    expect(seccionesConMesas).toEqual([
      { titulo: "Cobrar cuentas", vista: "", insignia: 3 },
      { titulo: "Cuentas cobradas", vista: "cobradas" },
      { titulo: "Movimientos y cierre", vista: "movimientos" },
    ]);
  });

  it("seccionesDeCaja no incluye 'Cobrar cuentas' cuando no hay nada que cobrar", () => {
    const seccionesSinMesas = seccionesDeCaja(false, 3);
    expect(seccionesSinMesas).toEqual([
      { titulo: "Cuentas cobradas", vista: "" },
      { titulo: "Movimientos y cierre", vista: "movimientos" },
    ]);
  });

  it("vistaInicialDeCaja entra por cobros si hay cuentas, y por el historial si no", () => {
    expect(vistaInicialDeCaja(true)).toBe("cobros");
    expect(vistaInicialDeCaja(false)).toBe("cobradas");
  });

  it("construirNavegacion propaga cuentasPorCobrar al padre Caja y al submenú Cobrar cuentas", () => {
    const nav = construirNavegacion({
      usaMesas: true,
      usaCocina: true,
      usaDomicilios: true,
      puedeVerInventario: true,
      cuentasPorCobrar: 4,
      comandasVivas: 2,
      domiciliosActivos: 1,
    });

    const operacion = nav.grupos.find((g) => g.titulo === "Operación");
    expect(operacion).toBeDefined();

    const itemCaja = operacion?.items.find((i) => i.titulo === "Caja");
    expect(itemCaja).toBeDefined();
    expect(itemCaja?.insignia).toBe(4);

    const subseccionCobrar = itemCaja?.secciones?.find((s) => s.titulo === "Cobrar cuentas");
    expect(subseccionCobrar).toBeDefined();
    expect(subseccionCobrar?.insignia).toBe(4);
  });

  it("hrefDeSeccion compone correctamente el enlace sin ensuciar la vista por defecto", () => {
    const item = {
      titulo: "Caja",
      href: "/caja",
      icono: () => null,
    };
    expect(hrefDeSeccion(item, { titulo: "Cobrar cuentas", vista: "" })).toBe("/caja");
    expect(hrefDeSeccion(item, { titulo: "Cuentas cobradas", vista: "cobradas" })).toBe("/caja?vista=cobradas");
  });
});
