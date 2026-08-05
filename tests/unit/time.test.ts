import { describe, expect, it } from "vitest";
import {
  businessDateFor,
  businessDayRange,
  formatBusinessDate,
  formatDateTimeInTimeZone,
  formatDayInTimeZone,
  formatTimeInTimeZone,
  isSameBusinessDay,
  parseBusinessDate,
} from "@/lib/time";

// Bogotá es UTC-5 todo el año: no hay horario de verano en Colombia.
const BOGOTA = { timeZone: "America/Bogota", businessDayStartMinutes: 300 };
const BOGOTA_SIN_CORTE = { timeZone: "America/Bogota", businessDayStartMinutes: 0 };

describe("businessDateFor", () => {
  it("una venta de la tarde cae en el día que uno esperaría", () => {
    // 2026-08-04 13:00 en Bogotá.
    const instante = new Date("2026-08-04T18:00:00Z");
    expect(formatBusinessDate(businessDateFor(instante, BOGOTA))).toBe("2026-08-04");
  });

  it("la madrugada pertenece a la jornada anterior", () => {
    // 2026-08-05 02:00 en Bogotá: el bar sigue abierto desde el día 4.
    const instante = new Date("2026-08-05T07:00:00Z");
    expect(formatBusinessDate(businessDateFor(instante, BOGOTA))).toBe("2026-08-04");
  });

  it("el corte es exacto al minuto", () => {
    // 04:59 local todavía es la jornada anterior; 05:00 ya es la nueva.
    const antes = new Date("2026-08-05T09:59:59.999Z");
    const despues = new Date("2026-08-05T10:00:00.000Z");

    expect(formatBusinessDate(businessDateFor(antes, BOGOTA))).toBe("2026-08-04");
    expect(formatBusinessDate(businessDateFor(despues, BOGOTA))).toBe("2026-08-05");
  });

  it("sin corte, el día de negocio es el día del calendario local", () => {
    const instante = new Date("2026-08-05T07:00:00Z"); // 02:00 local
    expect(formatBusinessDate(businessDateFor(instante, BOGOTA_SIN_CORTE))).toBe("2026-08-05");
  });

  it("la zona horaria manda sobre la del servidor", () => {
    // 2026-08-05 00:30 UTC es todavía 2026-08-04 19:30 en Bogotá. Un servidor que
    // calculara el día en UTC facturaría esta venta el día equivocado.
    const instante = new Date("2026-08-05T00:30:00Z");
    expect(formatBusinessDate(businessDateFor(instante, BOGOTA))).toBe("2026-08-04");
  });

  it("devuelve medianoche UTC, que es lo que espera una columna DATE", () => {
    const fecha = businessDateFor(new Date("2026-08-04T18:00:00Z"), BOGOTA);
    expect(fecha.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("rechaza zonas horarias y cortes inválidos", () => {
    const instante = new Date("2026-08-04T18:00:00Z");
    expect(() =>
      businessDateFor(instante, { timeZone: "Marte/Olympus", businessDayStartMinutes: 300 }),
    ).toThrow(RangeError);
    expect(() =>
      businessDateFor(instante, { timeZone: "America/Bogota", businessDayStartMinutes: 1440 }),
    ).toThrow(RangeError);
  });
});

describe("businessDayRange", () => {
  it("abre en el corte y cierra en el corte del día siguiente", () => {
    const { start, end } = businessDayRange(parseBusinessDate("2026-08-04"), BOGOTA);

    expect(start.toISOString()).toBe("2026-08-04T10:00:00.000Z"); // 05:00 en Bogotá
    expect(end.toISOString()).toBe("2026-08-05T10:00:00.000Z");
  });

  it("el intervalo contiene la madrugada de esa jornada y excluye su borde derecho", () => {
    const fecha = parseBusinessDate("2026-08-04");
    const { start, end } = businessDayRange(fecha, BOGOTA);

    const madrugada = new Date("2026-08-05T07:00:00Z"); // 02:00 local del día 5
    expect(madrugada >= start && madrugada < end).toBe(true);

    // El instante final ya es la jornada siguiente, y el rango es semiabierto.
    expect(businessDateFor(end, BOGOTA).getTime()).toBe(
      parseBusinessDate("2026-08-05").getTime(),
    );
  });

  it("respeta el horario de verano donde exista", () => {
    // Estados Unidos adelanta el reloj el 8 de marzo de 2026, así que la jornada
    // del 7 dura 23 horas. Colombia no cambia la hora, pero el cálculo no puede
    // asumirlo: la aritmética con días fijos de 24 horas se rompe acá.
    const nuevaYork = { timeZone: "America/New_York", businessDayStartMinutes: 300 };
    const { start, end } = businessDayRange(parseBusinessDate("2026-03-07"), nuevaYork);

    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});

describe("isSameBusinessDay", () => {
  it("junta la noche con su madrugada", () => {
    const noche = new Date("2026-08-04T23:00:00Z"); // 18:00 local del 4
    const madrugada = new Date("2026-08-05T07:00:00Z"); // 02:00 local del 5
    expect(isSameBusinessDay(noche, madrugada, BOGOTA)).toBe(true);
  });

  it("separa jornadas distintas", () => {
    const madrugada = new Date("2026-08-05T07:00:00Z"); // jornada del 4
    const manana = new Date("2026-08-05T15:00:00Z"); // 10:00 local del 5
    expect(isSameBusinessDay(madrugada, manana, BOGOTA)).toBe(false);
  });
});

describe("formatBusinessDate y parseBusinessDate", () => {
  it("van y vuelven sin perder nada", () => {
    for (const iso of ["2026-01-01", "2026-08-04", "2026-12-31", "2024-02-29"]) {
      expect(formatBusinessDate(parseBusinessDate(iso))).toBe(iso);
    }
  });

  it("rechazan formatos y fechas que no existen", () => {
    expect(() => parseBusinessDate("4/8/2026")).toThrow(RangeError);
    expect(() => parseBusinessDate("2026-8-4")).toThrow(RangeError);
    expect(() => parseBusinessDate("2026-02-30")).toThrow(RangeError);
    expect(() => parseBusinessDate("2025-02-29")).toThrow(RangeError);
  });
});

describe("formato para el tiquete", () => {
  it("muestra la hora local del negocio, no la del servidor", () => {
    const instante = new Date("2026-08-05T00:30:00Z");

    expect(formatDayInTimeZone(instante, "America/Bogota")).toBe("2026-08-04");
    expect(formatTimeInTimeZone(instante, "America/Bogota")).toBe("19:30");
    expect(formatDateTimeInTimeZone(instante, "America/Bogota")).toBe("2026-08-04 19:30");
  });

  it("rellena con cero a dos dígitos, para que las columnas no bailen", () => {
    const instante = new Date("2026-01-02T14:05:00Z"); // 09:05 local
    expect(formatDateTimeInTimeZone(instante, "America/Bogota")).toBe("2026-01-02 09:05");
  });
});
