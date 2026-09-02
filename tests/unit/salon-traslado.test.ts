import { describe, expect, it } from "vitest";
import { puedeTrasladarse } from "@/features/salon/reglas-traslado";

const cuenta = (extra: Partial<Parameters<typeof puedeTrasladarse>[0]> = {}) => ({
  status: "ABIERTA",
  tableId: "mesa-4",
  esDomicilio: false,
  ...extra,
});

const mesa = (extra: Partial<NonNullable<Parameters<typeof puedeTrasladarse>[1]>> = {}) => ({
  id: "mesa-7",
  status: "LIBRE",
  archivada: false,
  ...extra,
});

describe("trasladar una cuenta de mesa", () => {
  it("una cuenta abierta se muda a una mesa libre", () => {
    expect(puedeTrasladarse(cuenta(), mesa())).toEqual({ ok: true });
  });

  it("una cuenta con la cuenta pedida también: todavía no se cobró", () => {
    expect(puedeTrasladarse(cuenta({ status: "CUENTA_PEDIDA" }), mesa())).toEqual({ ok: true });
  });

  /**
   * Una mesa ocupada es un destino válido: el modelo admite varias cuentas por
   * mesa, y juntar dos grupos que se corrieron para hacer lugar es exactamente lo
   * que pasa en un salón.
   */
  it("la mesa destino puede estar ocupada", () => {
    expect(puedeTrasladarse(cuenta(), mesa({ status: "OCUPADA" }))).toEqual({ ok: true });
  });

  it("una mesa reservada se acepta: si el grupo llegó y se sentó, está ocupada", () => {
    expect(puedeTrasladarse(cuenta(), mesa({ status: "RESERVADA" }))).toEqual({ ok: true });
  });

  it("un pedido sin mesa se puede sentar en una", () => {
    expect(puedeTrasladarse(cuenta({ tableId: null }), mesa())).toEqual({ ok: true });
  });

  it("una cuenta ya pagada no se mueve", () => {
    expect(puedeTrasladarse(cuenta({ status: "PAGADA" }), mesa())).toEqual({
      ok: false,
      motivo: "PEDIDO_CERRADO",
    });
  });

  it("un domicilio no se sienta en una mesa", () => {
    expect(puedeTrasladarse(cuenta({ esDomicilio: true }), mesa())).toEqual({
      ok: false,
      motivo: "ES_DOMICILIO",
    });
  });

  it("trasladar a la misma mesa no es un traslado", () => {
    expect(puedeTrasladarse(cuenta({ tableId: "mesa-7" }), mesa())).toEqual({
      ok: false,
      motivo: "MISMA_MESA",
    });
  });

  it("una mesa archivada no recibe: quedaría colgada de algo que el salón no dibuja", () => {
    expect(puedeTrasladarse(cuenta(), mesa({ archivada: true }))).toEqual({
      ok: false,
      motivo: "MESA_INEXISTENTE",
    });
  });

  it("una mesa inexistente tampoco", () => {
    expect(puedeTrasladarse(cuenta(), null)).toEqual({
      ok: false,
      motivo: "MESA_INEXISTENTE",
    });
  });

  it("una mesa fuera de servicio no recibe", () => {
    expect(puedeTrasladarse(cuenta(), mesa({ status: "INACTIVA" }))).toEqual({
      ok: false,
      motivo: "MESA_INACTIVA",
    });
  });
});
