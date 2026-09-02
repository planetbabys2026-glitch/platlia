import { describe, expect, it } from "vitest";
import {
  aplicarAbono,
  diasDeLaDeudaMasVieja,
  normalizarTelefono,
  saldoTotal,
  telefonoEsUsable,
} from "@/features/cartera/reglas";

/**
 * La cartera decide plata que alguien debe. Un error acá no rompe ninguna
 * pantalla: deja a un cliente pagando dos veces, o al negocio dando por saldado
 * un pedido que sigue debiendo.
 */

describe("el teléfono es la identidad del deudor", () => {
  it("la misma persona escrita de cinco formas es un solo deudor", () => {
    const esperado = "3001234567";
    for (const forma of [
      "3001234567",
      "300 123 4567",
      "300-123-4567",
      "+57 300 123 4567",
      "573001234567",
    ]) {
      expect(normalizarTelefono(forma)).toBe(esperado);
    }
  });

  it("un fijo con indicativo de ciudad no se recorta", () => {
    // Solo se recorta el 57 cuando lo que queda es un celular de diez dígitos.
    expect(normalizarTelefono("604 444 5566")).toBe("6044445566");
  });

  it("un número demasiado corto no sirve como identidad", () => {
    expect(telefonoEsUsable("123")).toBe(false);
    expect(telefonoEsUsable("300 123 4567")).toBe(true);
  });
});

const fiado = (id: string, saldoCop: number) => ({ id, saldoCop });

describe("aplicarAbono: del más viejo al más nuevo", () => {
  it("un abono parcial baja el saldo del más viejo y no toca los demás", () => {
    const r = aplicarAbono([fiado("a", 20_000), fiado("b", 30_000)], 5_000);
    expect(r.aplicaciones).toEqual([{ fiadoId: "a", aplicadoCop: 5_000, saldaCompleto: false }]);
    expect(r.aplicadoCop).toBe(5_000);
    expect(r.sobranteCop).toBe(0);
  });

  it("un abono que calza exacto salda ese pedido y ninguno más", () => {
    const r = aplicarAbono([fiado("a", 20_000), fiado("b", 30_000)], 20_000);
    expect(r.aplicaciones).toEqual([{ fiadoId: "a", aplicadoCop: 20_000, saldaCompleto: true }]);
  });

  it("un abono grande cruza varios pedidos y deja el último a medias", () => {
    const r = aplicarAbono(
      [fiado("a", 20_000), fiado("b", 30_000), fiado("c", 45_000)],
      60_000,
    );
    expect(r.aplicaciones).toEqual([
      { fiadoId: "a", aplicadoCop: 20_000, saldaCompleto: true },
      { fiadoId: "b", aplicadoCop: 30_000, saldaCompleto: true },
      { fiadoId: "c", aplicadoCop: 10_000, saldaCompleto: false },
    ]);
    expect(r.aplicadoCop).toBe(60_000);
  });

  /**
   * Recibir más plata de la que se debe no es un abono, es un error de tecleo.
   * Se devuelve el sobrante en vez de aplicarlo para que quien llama decida.
   */
  it("lo que excede la deuda vuelve como sobrante, no se aplica", () => {
    const r = aplicarAbono([fiado("a", 20_000)], 50_000);
    expect(r.aplicadoCop).toBe(20_000);
    expect(r.sobranteCop).toBe(30_000);
  });

  it("los fiados ya saldados se saltan", () => {
    const r = aplicarAbono([fiado("a", 0), fiado("b", 10_000)], 4_000);
    expect(r.aplicaciones).toEqual([{ fiadoId: "b", aplicadoCop: 4_000, saldaCompleto: false }]);
  });

  it("un monto de cero o negativo no aplica nada", () => {
    expect(aplicarAbono([fiado("a", 10_000)], 0).aplicaciones).toEqual([]);
    expect(aplicarAbono([fiado("a", 10_000)], -5_000).aplicaciones).toEqual([]);
  });

  it("sin deuda, todo el abono sobra", () => {
    expect(aplicarAbono([], 10_000)).toEqual({
      aplicaciones: [],
      aplicadoCop: 0,
      sobranteCop: 10_000,
    });
  });
});

describe("cuánto y desde cuándo se debe", () => {
  it("el saldo total suma solo lo vivo", () => {
    expect(saldoTotal([fiado("a", 20_000), fiado("b", 0), fiado("c", 5_000)])).toBe(25_000);
  });

  /**
   * La lista de deudores se ordena por esto y no por monto: el que debe poco
   * desde hace cuatro meses es justamente al que nadie le cobra.
   */
  it("la antigüedad se mide contra la deuda viva más vieja", () => {
    const ahora = new Date("2026-09-01T12:00:00Z");
    const dias = diasDeLaDeudaMasVieja(
      [
        { saldoCop: 0, createdAt: new Date("2026-01-01T12:00:00Z") },
        { saldoCop: 10_000, createdAt: new Date("2026-08-20T12:00:00Z") },
        { saldoCop: 5_000, createdAt: new Date("2026-08-30T12:00:00Z") },
      ],
      ahora,
    );
    // La de enero está saldada: no cuenta. La más vieja viva es la del 20 de agosto.
    expect(dias).toBe(12);
  });

  it("sin deuda viva no hay antigüedad que informar", () => {
    expect(diasDeLaDeudaMasVieja([{ saldoCop: 0, createdAt: new Date() }])).toBeNull();
  });
});
