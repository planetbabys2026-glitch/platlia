import { describe, expect, it } from "vitest";
import { estadoDeMesa, etiquetaDeCuenta } from "@/lib/salon/mesa";

const abierta = { status: "ABIERTA" } as const;
const cuentaPedida = { status: "CUENTA_PEDIDA" } as const;
const pagada = { status: "PAGADA" } as const;
const anulada = { status: "ANULADA" } as const;

describe("estadoDeMesa", () => {
  it("sin cuentas vivas la mesa queda libre", () => {
    expect(estadoDeMesa("OCUPADA", [])).toBe("LIBRE");
    expect(estadoDeMesa("OCUPADA", [pagada, anulada])).toBe("LIBRE");
  });

  it("con una cuenta abierta la mesa está ocupada", () => {
    expect(estadoDeMesa("LIBRE", [abierta])).toBe("OCUPADA");
  });

  it("basta con que UNA de varias cuentas pida la cuenta", () => {
    expect(estadoDeMesa("OCUPADA", [abierta, cuentaPedida, abierta])).toBe("CUENTA_PEDIDA");
  });

  it("cobrar una de tres cuentas NO libera la mesa", () => {
    // Es el caso que rompía el salón: se cobraba una cuenta y la mesa aparecía
    // libre con las otras dos personas todavía sentadas.
    const despuesDeCobrarUna = [pagada, abierta, abierta];
    expect(estadoDeMesa("OCUPADA", despuesDeCobrarUna)).toBe("OCUPADA");
  });

  it("al cobrar la última la mesa sí se libera", () => {
    expect(estadoDeMesa("CUENTA_PEDIDA", [pagada, pagada, pagada])).toBe("LIBRE");
  });

  it("la mesa que volvió a estar sola deja de anunciar la cuenta", () => {
    // Se cobró justamente la que había pedido la cuenta.
    expect(estadoDeMesa("CUENTA_PEDIDA", [pagada, abierta])).toBe("OCUPADA");
  });

  it("una mesa fuera de servicio no vuelve sola", () => {
    expect(estadoDeMesa("INACTIVA", [])).toBe("INACTIVA");
    expect(estadoDeMesa("INACTIVA", [abierta])).toBe("INACTIVA");
  });

  it("la reserva se consume: al cerrar todo queda libre, no reservada", () => {
    expect(estadoDeMesa("RESERVADA", [pagada])).toBe("LIBRE");
    expect(estadoDeMesa("RESERVADA", [abierta])).toBe("OCUPADA");
  });
});

describe("etiquetaDeCuenta", () => {
  it("usa el nombre cuando lo hay", () => {
    expect(etiquetaDeCuenta("Andrés", 2)).toBe("Andrés");
  });

  it("cae al ordinal sin nombre, con espacios o en null", () => {
    expect(etiquetaDeCuenta(null, 1)).toBe("Cuenta 1");
    expect(etiquetaDeCuenta("", 3)).toBe("Cuenta 3");
    expect(etiquetaDeCuenta("   ", 4)).toBe("Cuenta 4");
    expect(etiquetaDeCuenta(undefined, 5)).toBe("Cuenta 5");
  });

  it("recorta el nombre", () => {
    expect(etiquetaDeCuenta("  Camila  ", 2)).toBe("Camila");
  });
});
