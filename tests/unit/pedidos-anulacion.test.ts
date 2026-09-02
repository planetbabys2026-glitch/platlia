import { describe, expect, it } from "vitest";
import { pideClaveDeAnulacion, sePuedeQuitar } from "@/features/pedidos/reglas-anulacion";

describe("sePuedeQuitar", () => {
  it("un renglón del carrito se quita", () => {
    expect(sePuedeQuitar({ status: "PENDIENTE", sentToKitchenAt: null })).toBe(true);
  });

  it("uno que YA salió a cocina no, aunque siga en PENDIENTE", () => {
    // Este es el caso que se rompía: entre que la comanda se imprime y que un
    // cocinero toca "Empezar" —que con papel no pasa nunca— el renglón seguía en
    // PENDIENTE y se podía sacar de la cuenta sin motivo y sin rastro.
    expect(
      sePuedeQuitar({ status: "PENDIENTE", sentToKitchenAt: new Date("2026-09-02T20:00:00Z") }),
    ).toBe(false);
  });

  it("uno que la cocina ya empezó, tampoco", () => {
    expect(sePuedeQuitar({ status: "EN_PREPARACION", sentToKitchenAt: null })).toBe(false);
  });

  it("acepta la fecha como texto, que es como llega del servidor al cliente", () => {
    expect(sePuedeQuitar({ status: "PENDIENTE", sentToKitchenAt: "2026-09-02T20:00:00Z" })).toBe(
      false,
    );
  });
});

describe("pideClaveDeAnulacion", () => {
  it("con consumo y clave puesta, la pide", () => {
    expect(pideClaveDeAnulacion(3, true)).toBe(true);
  });

  it("sin clave configurada nunca la pide: anular sigue funcionando", () => {
    // Mismo criterio que la clave de salidas de dinero: frenar la anulación de
    // entrada dejaría trabado a todo negocio que ya venía trabajando.
    expect(pideClaveDeAnulacion(3, false)).toBe(false);
  });

  it("un pedido VACÍO no la pide aunque haya clave", () => {
    // Es una mesa abierta por error. Pedirle una clave a quien se equivocó de
    // mesa es lo que deja las mesas fantasma abiertas toda la noche.
    expect(pideClaveDeAnulacion(0, true)).toBe(false);
  });
});
