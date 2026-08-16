import { describe, expect, it } from "vitest";
import { LISTA_POR_DEFECTO } from "@/lib/billing/precios";
import { prorratearSedeNueva } from "@/lib/billing/prorrateo";

/**
 * Lo que se le cobra a alguien por sumar una sede en la mitad de un período que
 * ya pagó. Cobrar el mes entero es cobrarle días que ya tenía pagos; cobrar cero
 * es regalar servicio.
 */

const LISTA = LISTA_POR_DEFECTO; // sede adicional: $30.000/mes

describe("prorratearSedeNueva", () => {
  it("a mitad de un mes cobra la mitad", () => {
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 1,
      inicioPeriodo: new Date("2026-08-01T00:00:00Z"),
      finPeriodo: new Date("2026-08-31T00:00:00Z"),
      ahora: new Date("2026-08-16T00:00:00Z"),
    });

    expect(p.diasTotales).toBe(30);
    expect(p.diasRestantes).toBe(15);
    expect(p.montoCop).toBe(15_000);
  });

  it("el primer día del período cobra el mes completo", () => {
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 1,
      inicioPeriodo: new Date("2026-08-01T00:00:00Z"),
      finPeriodo: new Date("2026-08-31T00:00:00Z"),
      ahora: new Date("2026-08-01T00:00:00Z"),
    });
    expect(p.montoCop).toBe(30_000);
  });

  it("dice cuánto va a costar la licencia desde la próxima renovación", () => {
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 1,
      inicioPeriodo: new Date("2026-08-01T00:00:00Z"),
      finPeriodo: new Date("2026-08-31T00:00:00Z"),
      ahora: new Date("2026-08-16T00:00:00Z"),
    });
    // De $50.000 pasa a $80.000: es el número que hay que decirle antes de cobrar.
    expect(p.mensualAntesCop).toBe(50_000);
    expect(p.mensualDesdeAhoraCop).toBe(80_000);
  });

  it("sobre un plan anual prorratea contra el año, no contra un mes", () => {
    // Suma una sede faltando medio año de un plan de doce meses: paga seis meses
    // de la sede nueva, no uno. Con la matriz vieja esto era un caso especial por
    // periodicidad; acá sale de las fechas.
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 1,
      inicioPeriodo: new Date("2026-01-01T00:00:00Z"),
      finPeriodo: new Date("2027-01-01T00:00:00Z"),
      ahora: new Date("2026-07-02T00:00:00Z"),
    });

    expect(p.diasTotales).toBe(365);
    // ~183 días de 365, sobre un costo de período de 30.000 × 365/30 = 365.000.
    expect(p.diasRestantes).toBe(183);
    expect(p.montoCop).toBeGreaterThan(180_000);
    expect(p.montoCop).toBeLessThan(190_000);
  });

  it("la tercera sede cuesta lo mismo que la segunda", () => {
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 2,
      inicioPeriodo: new Date("2026-08-01T00:00:00Z"),
      finPeriodo: new Date("2026-08-31T00:00:00Z"),
      ahora: new Date("2026-08-01T00:00:00Z"),
    });
    expect(p.montoCop).toBe(30_000);
    expect(p.mensualAntesCop).toBe(80_000);
    expect(p.mensualDesdeAhoraCop).toBe(110_000);
  });

  it("con el período ya vencido no cobra prorrateo", () => {
    // Lo que corresponde es renovar, y ahí la sede nueva ya entra en el precio
    // del período completo. Cobrar acá sería cobrar por días que no existen.
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 1,
      inicioPeriodo: new Date("2026-07-01T00:00:00Z"),
      finPeriodo: new Date("2026-08-01T00:00:00Z"),
      ahora: new Date("2026-08-16T00:00:00Z"),
    });
    expect(p.montoCop).toBe(0);
    expect(p.diasRestantes).toBe(0);
  });

  it("sin fechas de período cobra un mes de la sede nueva", () => {
    const p = prorratearSedeNueva({
      lista: LISTA,
      sedesActuales: 1,
      inicioPeriodo: null,
      finPeriodo: null,
    });
    expect(p.montoCop).toBe(30_000);
  });
});
