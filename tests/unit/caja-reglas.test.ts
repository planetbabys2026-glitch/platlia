import { describe, expect, it } from "vitest";
import {
  debeIrACaja,
  estadoDeCobro,
  HAY_QUE_COBRAR,
  ORDEN_DE_COBRO,
  usaKds,
} from "@/features/caja/reglas";

/**
 * Quién aparece en la caja, y en qué orden.
 *
 * Un error acá no rompe ninguna pantalla: le esconde al cajero una cuenta que ya
 * pidió pagar, o se la entierra bajo veinte que todavía están comiendo. Las dos
 * salen caras y ninguna falla ruidosamente.
 */

const base = {
  status: "ABIERTA",
  deliveryStatus: null,
  tieneItems: true,
  tieneItemsEnCocina: false,
} as const;

describe("debeIrACaja", () => {
  /**
   * El cambio de fondo: la caja lista lo que YA SE SIRVIÓ, no lo que alguien
   * mandó. Antes hacía falta que el mesero tocara "pedir la cuenta", y eso valía
   * cuando el cajero veía el salón; desde que el salón es solo del mesero, ese
   * trámite le escondía al cajero la plata viva en el piso.
   */
  it("entra en cuanto un renglón salió a cocina: eso es consumo real", () => {
    expect(debeIrACaja({ ...base, tieneItemsEnCocina: true })).toBe(true);
  });

  it("un carrito que nadie mandó a cocina NO entra", () => {
    // El pedido del POS guardado en espera, o la mesa recién sentada: todavía no
    // hay nada servido, así que no hay nada que cobrar.
    expect(debeIrACaja({ ...base })).toBe(false);
  });

  it("entra cuando alguien pidió la cuenta, aunque no haya pasado por cocina", () => {
    // Una botella de agua que se cobra sin comanda sigue siendo una venta.
    expect(debeIrACaja({ ...base, status: "CUENTA_PEDIDA" })).toBe(true);
  });

  it("un domicilio sin confirmar o en preparación NO entra por su recorrido", () => {
    expect(debeIrACaja({ ...base, deliveryStatus: "POR_CONFIRMAR" })).toBe(false);
    expect(debeIrACaja({ ...base, deliveryStatus: "EN_PREPARACION" })).toBe(false);
  });

  it("un domicilio entra cuando salió de la cocina, y sigue mientras no se cobre", () => {
    expect(debeIrACaja({ ...base, deliveryStatus: "LISTO" })).toBe(true);
    expect(debeIrACaja({ ...base, deliveryStatus: "EN_CAMINO" })).toBe(true);
    expect(debeIrACaja({ ...base, deliveryStatus: "ENTREGADO" })).toBe(true);
  });

  it("lo cobrado y lo anulado no vuelven", () => {
    expect(
      debeIrACaja({ ...base, status: "PAGADA", deliveryStatus: "EN_CAMINO", tieneItemsEnCocina: true }),
    ).toBe(false);
    expect(debeIrACaja({ ...base, status: "ANULADA", tieneItemsEnCocina: true })).toBe(false);
  });

  it("una cuenta sin un solo renglón vivo no es una cuenta", () => {
    expect(
      debeIrACaja({ ...base, status: "CUENTA_PEDIDA", tieneItems: false }),
    ).toBe(false);
  });
});

describe("HAY_QUE_COBRAR", () => {
  it("tiene exactamente las tres puertas y ninguna más", () => {
    // Una cuarta rama es una cuenta llegando a la caja por un camino que nadie
    // decidió. La tercera se agregó a propósito y está documentada arriba.
    expect(HAY_QUE_COBRAR.OR).toHaveLength(3);
    expect(HAY_QUE_COBRAR.OR[0]).toEqual({ status: "CUENTA_PEDIDA" });
    expect(HAY_QUE_COBRAR.OR[1]).toEqual({
      deliveryStatus: { in: ["LISTO", "EN_CAMINO", "ENTREGADO"] },
    });
    expect(HAY_QUE_COBRAR.OR[2]).toEqual({
      items: { some: { sentToKitchenAt: { not: null }, status: { not: "ANULADO" } } },
    });
  });
});

const servido = { status: "LISTO" };
const cocinando = { status: "EN_PREPARACION" };

describe("estadoDeCobro: el orden de la lista", () => {
  it("quien pidió la cuenta va primero, esté como esté la cocina", () => {
    expect(
      estadoDeCobro({ status: "CUENTA_PEDIDA", deliveryStatus: null, items: [cocinando] }),
    ).toBe("PIDIO_CUENTA");
  });

  it("con todo servido queda listo para cobrar", () => {
    expect(
      estadoDeCobro({ status: "ABIERTA", deliveryStatus: null, items: [servido, servido] }),
    ).toBe("LISTO");
  });

  it("con algo todavía en la plancha, sigue en curso", () => {
    expect(
      estadoDeCobro({ status: "ABIERTA", deliveryStatus: null, items: [servido, cocinando] }),
    ).toBe("EN_CURSO");
  });

  it("los anulados no cuentan para decidir si ya se sirvió todo", () => {
    expect(
      estadoDeCobro({
        status: "ABIERTA",
        deliveryStatus: null,
        items: [servido, { status: "ANULADO" }],
      }),
    ).toBe("LISTO");
  });

  it("un domicilio que salió de cocina está listo", () => {
    expect(
      estadoDeCobro({ status: "ABIERTA", deliveryStatus: "LISTO", items: [cocinando] }),
    ).toBe("LISTO");
  });

  it("el orden pone lo urgente arriba", () => {
    expect(ORDEN_DE_COBRO.PIDIO_CUENTA).toBeLessThan(ORDEN_DE_COBRO.LISTO);
    expect(ORDEN_DE_COBRO.LISTO).toBeLessThan(ORDEN_DE_COBRO.EN_CURSO);
  });
});

describe("cocina en solo papel: nadie mueve el estado de un plato", () => {
  it("`usaKds` distingue las tres formas de sacar la comanda", () => {
    expect(usaKds("KDS")).toBe(true);
    expect(usaKds("AMBAS")).toBe(true);
    expect(usaKds("IMPRESA")).toBe(false);
  });

  /**
   * El caso que motivó esto: con papel, ningún renglón llega nunca a LISTO, así
   * que sin esta regla TODA cuenta se quedaría en "En curso" para siempre y los
   * tres grupos de la caja serían uno solo con todo adentro. Decir "en curso" ahí
   * es mentir: implica que alguien lo va a mover, y no hay quién.
   */
  it("sin KDS, lo que salió a la plancha ya se puede cobrar", () => {
    const pedido = { status: "ABIERTA", deliveryStatus: null, items: [cocinando] };
    expect(estadoDeCobro(pedido, { hayKds: true })).toBe("EN_CURSO");
    expect(estadoDeCobro(pedido, { hayKds: false })).toBe("LISTO");
  });

  it("sin KDS, quien pidió la cuenta sigue yendo primero", () => {
    expect(
      estadoDeCobro(
        { status: "CUENTA_PEDIDA", deliveryStatus: null, items: [cocinando] },
        { hayKds: false },
      ),
    ).toBe("PIDIO_CUENTA");
  });

  it("por defecto se asume que hay pantalla: es lo que traía el producto", () => {
    expect(
      estadoDeCobro({ status: "ABIERTA", deliveryStatus: null, items: [cocinando] }),
    ).toBe("EN_CURSO");
  });
});
