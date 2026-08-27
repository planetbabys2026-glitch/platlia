import { describe, expect, it } from "vitest";
import {
  construirNavegacion,
  hrefDeSeccion,
  seccionesDeCaja,
  vistaInicialDeCaja,
} from "@/app/(app)/navegacion";

describe("navegación y submenús con insignias", () => {
  it("seccionesDeCaja asigna la insignia de cuentasPorCobrar a 'Cobrar cuentas'", () => {
    expect(seccionesDeCaja(3)).toEqual([
      { titulo: "Cobrar cuentas", vista: "", insignia: 3 },
      { titulo: "Cuentas cobradas", vista: "cobradas" },
      { titulo: "Movimientos y cierre", vista: "movimientos" },
    ]);
  });

  it("'Cobrar cuentas' se le ofrece también al negocio de mostrador", () => {
    // Desde que el POS tiene su propio "Enviar a caja", esconderle la sección al
    // mostrador le escondía justamente las cuentas que acababa de mandar.
    const nav = construirNavegacion({
      usaMesas: false,
      usaCocina: true,
      usaDomicilios: false,
      puedeVerInventario: false,
      cuentasPorCobrar: 2,
    });
    const itemCaja = nav.grupos
      .find((g) => g.titulo === "Operación")
      ?.items.find((i) => i.titulo === "Caja");
    expect(itemCaja?.secciones?.[0]).toEqual({
      titulo: "Cobrar cuentas",
      vista: "",
      insignia: 2,
    });
    expect(itemCaja?.insignia).toBe(2);
  });

  it("el enlace del punto de venta es /pos, y se llama distinto según haya mesas", () => {
    const conMesas = construirNavegacion({
      usaMesas: true,
      usaCocina: true,
      usaDomicilios: true,
      puedeVerInventario: false,
    });
    const sinMesas = construirNavegacion({
      usaMesas: false,
      usaCocina: true,
      usaDomicilios: false,
      puedeVerInventario: false,
    });
    const operacion = (nav: ReturnType<typeof construirNavegacion>) =>
      nav.grupos.find((g) => g.titulo === "Operación")?.items ?? [];

    expect(operacion(conMesas).find((i) => i.href === "/pos")?.titulo).toBe("Pedido sin mesa");
    expect(operacion(sinMesas).find((i) => i.href === "/pos")?.titulo).toBe("POS");
    // Salón solo existe con mesas; el POS existe siempre.
    expect(operacion(sinMesas).some((i) => i.href === "/salon")).toBe(false);
  });

  it("vistaInicialDeCaja entra siempre por cobros", () => {
    expect(vistaInicialDeCaja()).toBe("cobros");
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
