import { describe, expect, it } from "vitest";
import { debeIrACaja, HAY_QUE_COBRAR } from "@/features/caja/reglas";

/**
 * Quién aparece en la caja.
 *
 * Un error acá no rompe ninguna pantalla: le pone al cajero cuentas de gente que
 * todavía está comiendo, o le esconde una que ya pidió pagar. Las dos versiones
 * salen caras y ninguna falla ruidosamente.
 */

const base = { status: "ABIERTA", deliveryStatus: null, tieneItems: true } as const;

describe("debeIrACaja", () => {
  it("un pedido abierto NO entra por no tener mesa", () => {
    // Era la rama `{ tableId: null, status: "ABIERTA" }`: todo lo del POS
    // —guardado en espera o recién mandado a cocina— aparecía en la caja solo.
    expect(debeIrACaja({ ...base })).toBe(false);
  });

  it("un pedido abierto NO entra porque la cocina haya terminado", () => {
    // Que el plato esté listo no es que el cliente quiera irse.
    expect(debeIrACaja({ ...base })).toBe(false);
  });

  it("entra cuando alguien pidió la cuenta", () => {
    expect(debeIrACaja({ ...base, status: "CUENTA_PEDIDA" })).toBe(true);
  });

  it("un domicilio sin confirmar o en preparación NO entra", () => {
    expect(debeIrACaja({ ...base, deliveryStatus: "POR_CONFIRMAR" })).toBe(false);
    expect(debeIrACaja({ ...base, deliveryStatus: "EN_PREPARACION" })).toBe(false);
  });

  it("un domicilio entra cuando salió de la cocina, y sigue mientras no se cobre", () => {
    expect(debeIrACaja({ ...base, deliveryStatus: "LISTO" })).toBe(true);
    expect(debeIrACaja({ ...base, deliveryStatus: "EN_CAMINO" })).toBe(true);
    expect(debeIrACaja({ ...base, deliveryStatus: "ENTREGADO" })).toBe(true);
  });

  it("lo cobrado y lo anulado no vuelven", () => {
    expect(debeIrACaja({ ...base, status: "PAGADA", deliveryStatus: "EN_CAMINO" })).toBe(false);
    expect(debeIrACaja({ ...base, status: "ANULADA" })).toBe(false);
  });

  it("una cuenta sin un solo renglón vivo no es una cuenta", () => {
    expect(debeIrACaja({ ...base, status: "CUENTA_PEDIDA", tieneItems: false })).toBe(false);
  });
});

describe("HAY_QUE_COBRAR", () => {
  it("tiene exactamente las dos puertas y ninguna más", () => {
    // Si alguien agrega una tercera rama, este test la delata: cada rama nueva es
    // una cuenta que llega a la caja sin que nadie la haya mandado.
    expect(HAY_QUE_COBRAR.OR).toHaveLength(2);
    expect(HAY_QUE_COBRAR.OR[0]).toEqual({ status: "CUENTA_PEDIDA" });
    expect(HAY_QUE_COBRAR.OR[1]).toEqual({
      deliveryStatus: { in: ["LISTO", "EN_CAMINO", "ENTREGADO"] },
    });
  });
});
