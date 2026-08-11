import { describe, expect, it } from "vitest";
import { calcularProrrateoSegundaSucursal } from "@/lib/billing/prorrateo";

describe("Cálculo de Prorrateo para Adición de 2ª Sucursal", () => {
  it("calcula prorrateo mensual a mitad de mes (15 días de 30) = $15.000 COP", () => {
    const inicioPeriodo = new Date("2026-08-01T00:00:00Z");
    const finPeriodo = new Date("2026-08-31T00:00:00Z"); // 30 días
    const ahora = new Date("2026-08-16T00:00:00Z"); // 15 días restantes

    const res = calcularProrrateoSegundaSucursal({
      frecuencia: "mensual",
      inicioPeriodo,
      finPeriodo,
      ahora,
    });

    expect(res.montoProrrateoCop).toBe(15000);
    expect(res.diasRestantes).toBe(15);
    expect(res.precioSiguienteCicloCop).toBe(80000);
  });

  it("calcula prorrateo semestral a 3 meses restantes (90 días de 180) = $81.000 COP", () => {
    const inicioPeriodo = new Date("2026-01-01T00:00:00Z");
    const finPeriodo = new Date("2026-07-01T00:00:00Z"); // 181 días
    const ahora = new Date("2026-04-01T00:00:00Z"); // 91 días restantes

    const res = calcularProrrateoSegundaSucursal({
      frecuencia: "6meses",
      inicioPeriodo,
      finPeriodo,
      ahora,
    });

    // 162.000 * (91/181) = 81.425 -> Math.round = 81425
    expect(res.montoProrrateoCop).toBeGreaterThanOrEqual(81000);
    expect(res.montoProrrateoCop).toBeLessThanOrEqual(82000);
    expect(res.precioSiguienteCicloCop).toBe(432000);
  });

  it("retorna 0 si ya no quedan días en el ciclo vigente", () => {
    const inicioPeriodo = new Date("2026-07-01T00:00:00Z");
    const finPeriodo = new Date("2026-08-01T00:00:00Z");
    const ahora = new Date("2026-08-02T00:00:00Z");

    const res = calcularProrrateoSegundaSucursal({
      frecuencia: "mensual",
      inicioPeriodo,
      finPeriodo,
      ahora,
    });

    expect(res.montoProrrateoCop).toBe(0);
    expect(res.diasRestantes).toBe(0);
  });
});
