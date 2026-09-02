import { describe, expect, it } from "vitest";
import {
  esGastoOperativo,
  esSalidaDeDinero,
  resumirGastos,
  sesionDeCobro,
} from "@/features/caja/reglas";

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

/**
 * El gasto es más angosto que la salida de dinero, y la diferencia es el RETIRO.
 * Si algún día se igualan, la ganancia estimada de una noche buena —en la que
 * justamente se retira más— se va a informar como una noche mala.
 */
describe("esGastoOperativo", () => {
  it("un egreso es gasto", () => {
    expect(esGastoOperativo("EGRESO", 50_000)).toBe(true);
  });

  it("un retiro NO es gasto: la plata cambia de lugar, no se consume", () => {
    expect(esGastoOperativo("RETIRO", 500_000)).toBe(false);
    expect(esSalidaDeDinero("RETIRO", 500_000)).toBe(true);
  });

  it("el ajuste negativo sí, porque es la puerta de al lado del gasto", () => {
    expect(esGastoOperativo("AJUSTE", -20_000)).toBe(true);
  });

  it("el ajuste positivo no: es plata que aparece, no que sale", () => {
    expect(esGastoOperativo("AJUSTE", 20_000)).toBe(false);
  });

  it("un ingreso no entra por el otro lado: el abono de cartera ya se contó al fiar", () => {
    expect(esGastoOperativo("INGRESO", 80_000)).toBe(false);
  });
});

/**
 * La aritmética del informe de ganancia estimada.
 *
 * Se prueba acá y no contra la base porque las tres decisiones que la hacen
 * correcta —el retiro afuera, el ajuste por su signo, el concepto normalizado—
 * no son consultables: son criterio, y el criterio se rompe en silencio.
 */
describe("resumirGastos", () => {
  const g = (type: string, amountCop: number, concept: string, account = "EFECTIVO") => ({
    type,
    account,
    amountCop,
    concept,
  });

  it("suma egresos y separa por cuenta", () => {
    const r = resumirGastos([
      g("EGRESO", 30_000, "Proveedor de carnes", "BANCO"),
      g("EGRESO", 50_000, "Pago gaseosa", "BANCO"),
      g("EGRESO", 12_000, "Hielo"),
    ]);
    expect(r.gastosCop).toBe(92_000);
    expect(r.bancoCop).toBe(80_000);
    expect(r.efectivoCop).toBe(12_000);
    expect(r.movimientos).toBe(3);
  });

  it("el retiro NO baja la ganancia, pero se informa aparte", () => {
    const r = resumirGastos([g("EGRESO", 20_000, "Hielo"), g("RETIRO", 500_000, "Consignación")]);
    expect(r.gastosCop).toBe(20_000);
    expect(r.retirosCop).toBe(500_000);
    expect(r.conceptos.map((c) => c.concepto)).toEqual(["Hielo"]);
  });

  it("el ajuste cuenta por su signo y siempre se acumula en positivo", () => {
    const r = resumirGastos([g("AJUSTE", -15_000, "Faltante"), g("AJUSTE", 8_000, "Sobrante")]);
    expect(r.gastosCop).toBe(15_000);
    expect(r.movimientos).toBe(1);
  });

  it("agrupa el mismo concepto escrito distinto y conserva la primera forma", () => {
    const r = resumirGastos([
      g("EGRESO", 10_000, "Hielo"),
      g("EGRESO", 5_000, "  hielo "),
      g("EGRESO", 3_000, "HIELO"),
    ]);
    expect(r.conceptos).toHaveLength(1);
    expect(r.conceptos[0]!.concepto).toBe("Hielo");
    expect(r.conceptos[0]!.cantidad).toBe(3);
    expect(r.conceptos[0]!.totalCop).toBe(18_000);
  });

  it("ordena de mayor a menor: la pregunta es en qué se fue la plata", () => {
    const r = resumirGastos([
      g("EGRESO", 10_000, "Hielo"),
      g("EGRESO", 90_000, "Carne"),
      g("EGRESO", 40_000, "Gaseosa"),
    ]);
    expect(r.conceptos.map((c) => c.concepto)).toEqual(["Carne", "Gaseosa", "Hielo"]);
  });

  it("el ingreso no entra: el abono de cartera ya se contó como venta al fiar", () => {
    const r = resumirGastos([g("INGRESO", 80_000, "Abono de cartera")]);
    expect(r.gastosCop).toBe(0);
    expect(r.conceptos).toEqual([]);
  });

  it("sin movimientos da ceros, no NaN", () => {
    expect(resumirGastos([])).toEqual({
      gastosCop: 0,
      efectivoCop: 0,
      bancoCop: 0,
      movimientos: 0,
      retirosCop: 0,
      conceptos: [],
    });
  });
});
