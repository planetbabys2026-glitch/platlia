import { describe, expect, it } from "vitest";
import { esSalidaDeDinero, sesionDeCobro } from "@/features/caja/reglas";

describe("qué movimiento es una salida de dinero", () => {
  it("el gasto y el retiro siempre lo son", () => {
    expect(esSalidaDeDinero("EGRESO", 45_000)).toBe(true);
    expect(esSalidaDeDinero("RETIRO", 200_000)).toBe(true);
  });

  it("una entrada no lo es", () => {
    expect(esSalidaDeDinero("INGRESO", 50_000)).toBe(false);
  });

  /**
   * El ajuste es la puerta de al lado: mismo efecto que un gasto, otro nombre.
   * Sin esta regla, quien no quiera escribir la clave registra el faltante como
   * ajuste negativo y saca la plata igual.
   */
  it("el ajuste depende del signo, que es lo único que lo distingue de un gasto", () => {
    expect(esSalidaDeDinero("AJUSTE", -30_000)).toBe(true);
    expect(esSalidaDeDinero("AJUSTE", 30_000)).toBe(false);
    expect(esSalidaDeDinero("AJUSTE", 0)).toBe(false);
  });
});

const caja = (id: string, openedById: string) => ({ id, openedById, cajaNombre: id });

describe("en qué caja cae un cobro", () => {
  it("sin cajas abiertas no se cobra", () => {
    expect(sesionDeCobro([], "u1")).toEqual({ ok: false, motivo: "SIN_CAJA" });
  });

  it("con turno propio, ahí va: es el caso normal", () => {
    const abiertas = [caja("s1", "u1"), caja("s2", "u2")];
    expect(sesionDeCobro(abiertas, "u2")).toEqual({ ok: true, cashSessionId: "s2" });
  });

  it("el dueño que cobra un rato entra a la única caja abierta", () => {
    expect(sesionDeCobro([caja("s1", "u1")], "dueño")).toEqual({
      ok: true,
      cashSessionId: "s1",
    });
  });

  /**
   * Acá está el punto: con dos cajas abiertas y ninguna suya, cualquier elección
   * mete la plata en el arqueo de otra persona, y el faltante lo paga quien no lo
   * hizo. Es preferible pedirle que abra su turno.
   */
  it("con varias abiertas y ninguna propia se rechaza en vez de adivinar", () => {
    const abiertas = [caja("s1", "u1"), caja("s2", "u2")];
    expect(sesionDeCobro(abiertas, "u9")).toEqual({
      ok: false,
      motivo: "VARIAS_Y_NINGUNA_TUYA",
    });
  });
});
