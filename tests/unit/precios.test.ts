import { describe, expect, it } from "vitest";
import {
  cotizar,
  esPromocion,
  listaParaNegocio,
  cotizarTodas,
  esPeriodicidad,
  LISTA_POR_DEFECTO,
  listaVigente,
  mesesSegunMonto,
  type ListaDePrecios,
} from "@/lib/billing/precios";

/**
 * Lo que se le cobra a un cliente. Un error acá no rompe ninguna pantalla: le
 * cobra de más a alguien que confió, o le regala meses al que no pagó, y las dos
 * cosas se descubren tarde y a mano.
 */

const BASE = LISTA_POR_DEFECTO;

function promo(parcial: Partial<ListaDePrecios>): ListaDePrecios {
  return { ...BASE, id: "promo", nombre: "Promo", ...parcial };
}

describe("cotizar · los precios acordados", () => {
  it("una sede, mes a mes: $50.000", () => {
    const c = cotizar({ lista: BASE, sedes: 1, periodicidad: "MENSUAL" });
    expect(c.totalCop).toBe(50_000);
    expect(c.mesesOtorgados).toBe(1);
    expect(c.mesesGratis).toBe(0);
    expect(c.ahorroCop).toBe(0);
  });

  it("dos sedes, mes a mes: $80.000 (50.000 + 30.000)", () => {
    expect(cotizar({ lista: BASE, sedes: 2, periodicidad: "MENSUAL" }).totalCop).toBe(80_000);
  });

  it("una sede, seis meses: se pagan cinco = $250.000", () => {
    const c = cotizar({ lista: BASE, sedes: 1, periodicidad: "SEMESTRAL" });
    expect(c.mesesOtorgados).toBe(6);
    expect(c.mesesCobrados).toBe(5);
    expect(c.mesesGratis).toBe(1);
    expect(c.totalCop).toBe(250_000);
    expect(c.ahorroCop).toBe(50_000);
  });

  it("una sede, doce meses: se pagan diez = $500.000", () => {
    const c = cotizar({ lista: BASE, sedes: 1, periodicidad: "ANUAL" });
    expect(c.mesesCobrados).toBe(10);
    expect(c.mesesGratis).toBe(2);
    expect(c.totalCop).toBe(500_000);
    expect(c.ahorroCop).toBe(100_000);
  });

  it("dos sedes, seis y doce meses: $400.000 y $800.000", () => {
    expect(cotizar({ lista: BASE, sedes: 2, periodicidad: "SEMESTRAL" }).totalCop).toBe(400_000);
    expect(cotizar({ lista: BASE, sedes: 2, periodicidad: "ANUAL" }).totalCop).toBe(800_000);
  });

  it("cada sede adicional suma su precio, no el del principal", () => {
    // Tres sedes se negocian con ventas, pero la aritmética tiene que ser correcta
    // igual: el superadmin habilita el cupo y alguien va a cobrarlo.
    expect(cotizar({ lista: BASE, sedes: 3, periodicidad: "MENSUAL" }).mensualCop).toBe(110_000);
  });

  it("el equivalente mensual muestra el descuento sin usarlo para cobrar", () => {
    const c = cotizar({ lista: BASE, sedes: 1, periodicidad: "ANUAL" });
    // $500.000 repartidos en los 12 meses que sí recibe.
    expect(c.mensualEquivalenteCop).toBe(41_667);
    // Pero lo que se cobra es el total, no el equivalente × 12.
    expect(c.totalCop).toBe(500_000);
  });

  it("no acepta una cantidad de sedes que no sea un entero de 1 o más", () => {
    expect(() => cotizar({ lista: BASE, sedes: 0, periodicidad: "MENSUAL" })).toThrow(RangeError);
    expect(() => cotizar({ lista: BASE, sedes: 1.5, periodicidad: "MENSUAL" })).toThrow(RangeError);
  });

  it("un regalo más grande que el plan no deja el total en cero", () => {
    // Alguien escribe "6 meses gratis al comprar 6" en la consola. Se cobra 1.
    const exagerada = promo({ mesesGratisSemestral: 6 });
    const c = cotizar({ lista: exagerada, sedes: 1, periodicidad: "SEMESTRAL" });
    expect(c.mesesCobrados).toBe(1);
    expect(c.totalCop).toBe(50_000);
  });
});

describe("listaVigente · qué precio rige hoy", () => {
  const ahora = new Date("2026-06-15T12:00:00Z");

  it("sin promociones manda la lista base", () => {
    expect(listaVigente([BASE], ahora).id).toBe(BASE.id);
  });

  it("sin ninguna lista no se queda sin precio", () => {
    // Una base recién clonada o un test: mejor el precio de fábrica que cobrar cero.
    expect(listaVigente([], ahora).precioSedePrincipalCop).toBe(50_000);
  });

  it("una promo dentro de su ventana le gana a la base", () => {
    const junio = promo({
      precioSedePrincipalCop: 35_000,
      desde: new Date("2026-06-01T00:00:00Z"),
      hasta: new Date("2026-07-01T00:00:00Z"),
    });
    expect(listaVigente([BASE, junio], ahora).precioSedePrincipalCop).toBe(35_000);
  });

  it("fuera de la ventana vuelve la base", () => {
    const mayo = promo({
      precioSedePrincipalCop: 35_000,
      desde: new Date("2026-05-01T00:00:00Z"),
      hasta: new Date("2026-06-01T00:00:00Z"),
    });
    expect(listaVigente([BASE, mayo], ahora).precioSedePrincipalCop).toBe(50_000);
  });

  it("el día que termina ya no es promo", () => {
    const corte = new Date("2026-07-01T00:00:00Z");
    const junio = promo({
      precioSedePrincipalCop: 35_000,
      desde: new Date("2026-06-01T00:00:00Z"),
      hasta: corte,
    });
    expect(listaVigente([BASE, junio], new Date(corte.getTime() - 1)).precioSedePrincipalCop).toBe(35_000);
    expect(listaVigente([BASE, junio], corte).precioSedePrincipalCop).toBe(50_000);
  });

  it("una promo apagada no se aplica aunque esté en fecha", () => {
    const apagada = promo({
      precioSedePrincipalCop: 35_000,
      activa: false,
      desde: new Date("2026-06-01T00:00:00Z"),
      hasta: new Date("2026-07-01T00:00:00Z"),
    });
    expect(listaVigente([BASE, apagada], ahora).precioSedePrincipalCop).toBe(50_000);
  });

  it("con dos promos superpuestas gana la que arrancó después", () => {
    const vieja = promo({
      id: "vieja",
      precioSedePrincipalCop: 45_000,
      desde: new Date("2026-06-01T00:00:00Z"),
      hasta: new Date("2026-07-01T00:00:00Z"),
    });
    const nueva = promo({
      id: "nueva",
      precioSedePrincipalCop: 35_000,
      desde: new Date("2026-06-10T00:00:00Z"),
      hasta: new Date("2026-07-01T00:00:00Z"),
    });
    expect(listaVigente([BASE, vieja, nueva], ahora).id).toBe("nueva");
  });

  it("una promo sin fecha de fin no vence", () => {
    const abierta = promo({
      precioSedePrincipalCop: 35_000,
      desde: new Date("2026-01-01T00:00:00Z"),
      hasta: null,
    });
    expect(listaVigente([BASE, abierta], ahora).precioSedePrincipalCop).toBe(35_000);
  });

  it("una promo puede cambiar los meses de regalo, no solo el precio", () => {
    const generosa = promo({
      mesesGratisAnual: 3,
      desde: new Date("2026-06-01T00:00:00Z"),
      hasta: new Date("2026-07-01T00:00:00Z"),
    });
    const lista = listaVigente([BASE, generosa], ahora);
    expect(cotizar({ lista, sedes: 1, periodicidad: "ANUAL" }).totalCop).toBe(450_000);
  });
});

describe("listaParaNegocio · el precio congelado y la promo", () => {
  const promoJunio = promo({
    precioSedePrincipalCop: 35_000,
    desde: new Date("2026-06-01T00:00:00Z"),
    hasta: new Date("2026-07-01T00:00:00Z"),
  });

  it("sin promo se le respeta el precio que ya tenía", () => {
    // Entró pagando 40.000 y la lista subió a 50.000: sigue pagando 40.000.
    const suya = listaParaNegocio(BASE, 40_000);
    expect(cotizar({ lista: suya, sedes: 1, periodicidad: "MENSUAL" }).totalCop).toBe(40_000);
  });

  it("una promo le gana al precio propio, aunque el propio sea más caro", () => {
    // El precio propio protege de las subas, no de los descuentos.
    const suya = listaParaNegocio(promoJunio, 50_000);
    expect(cotizar({ lista: suya, sedes: 1, periodicidad: "MENSUAL" }).totalCop).toBe(35_000);
  });

  it("una promo no le arruina el precio a quien ya tenía uno mejor", () => {
    // Ojo: si el propio fuera MÁS barato que la promo, la promo igual manda.
    // Es una decisión consciente y por eso está escrita en un test: la promo es
    // una lista completa, no un descuento que se apile sobre otro precio.
    const suya = listaParaNegocio(promoJunio, 20_000);
    expect(cotizar({ lista: suya, sedes: 1, periodicidad: "MENSUAL" }).totalCop).toBe(35_000);
  });

  it("sin precio propio se usa la lista tal cual", () => {
    expect(listaParaNegocio(BASE, null).precioSedePrincipalCop).toBe(50_000);
    expect(listaParaNegocio(BASE, undefined).precioSedePrincipalCop).toBe(50_000);
  });

  it("un precio propio corrupto no rompe el cobro", () => {
    expect(listaParaNegocio(BASE, -1).precioSedePrincipalCop).toBe(50_000);
    expect(listaParaNegocio(BASE, 1.5).precioSedePrincipalCop).toBe(50_000);
  });

  it("la sede adicional sigue saliendo de la lista, no del precio propio", () => {
    const suya = listaParaNegocio(BASE, 40_000);
    expect(cotizar({ lista: suya, sedes: 2, periodicidad: "MENSUAL" }).totalCop).toBe(70_000);
  });

  it("distingue una promo de la lista base", () => {
    expect(esPromocion(BASE)).toBe(false);
    expect(esPromocion(promoJunio)).toBe(true);
  });
});

describe("mesesSegunMonto · la red del webhook", () => {
  it("reconoce el monto de cada plan de una sede", () => {
    expect(mesesSegunMonto(50_000, 50_000, BASE)).toBe(1);
    expect(mesesSegunMonto(250_000, 50_000, BASE)).toBe(6);
    expect(mesesSegunMonto(500_000, 50_000, BASE)).toBe(12);
  });

  it("reconoce los de dos sedes", () => {
    expect(mesesSegunMonto(800_000, 80_000, BASE)).toBe(12);
    expect(mesesSegunMonto(400_000, 80_000, BASE)).toBe(6);
  });

  it("ante un monto que no cuadra no inventa meses", () => {
    expect(mesesSegunMonto(123_456, 50_000, BASE)).toBeNull();
    expect(mesesSegunMonto(50_000, 0, BASE)).toBeNull();
  });
});

describe("cotizarTodas y esPeriodicidad", () => {
  it("devuelve las tres opciones en orden", () => {
    const todas = cotizarTodas(BASE, 1);
    expect(todas.map((c) => c.periodicidad)).toEqual(["MENSUAL", "SEMESTRAL", "ANUAL"]);
    expect(todas.map((c) => c.totalCop)).toEqual([50_000, 250_000, 500_000]);
  });

  it("no deja pasar una periodicidad inventada", () => {
    expect(esPeriodicidad("ANUAL")).toBe(true);
    expect(esPeriodicidad("SEMANAL")).toBe(false);
    expect(esPeriodicidad(undefined)).toBe(false);
  });
});
