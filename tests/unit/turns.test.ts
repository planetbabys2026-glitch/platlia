import { describe, expect, it } from "vitest";
import { formatTurno, siguienteTurno } from "@/lib/turns";

describe("siguienteTurno", () => {
  it("el primero de la jornada es 1", () => {
    expect(siguienteTurno(null)).toBe(1);
  });

  it("avanza de a uno", () => {
    expect(siguienteTurno(1)).toBe(2);
    expect(siguienteTurno(46)).toBe(47);
  });

  it("rota al llegar al tope", () => {
    expect(siguienteTurno(99)).toBe(1);
    expect(siguienteTurno(20, 20)).toBe(1);
  });

  it("se reinicia si el tope bajó y quedaron turnos por encima", () => {
    // El dueño cambió el tope de 99 a 50 con turnos viejos en 80.
    expect(siguienteTurno(80, 50)).toBe(1);
  });

  it("da la vuelta completa sin saltarse ni repetir dentro del ciclo", () => {
    const max = 5;
    const vistos: number[] = [];
    let turno: number | null = null;
    for (let i = 0; i < max; i++) {
      turno = siguienteTurno(turno, max);
      vistos.push(turno);
    }
    expect(vistos).toEqual([1, 2, 3, 4, 5]);
    expect(siguienteTurno(turno, max)).toBe(1);
  });

  it("rechaza topes y turnos inválidos", () => {
    expect(() => siguienteTurno(1, 0)).toThrow(RangeError);
    expect(() => siguienteTurno(1, 2.5)).toThrow(RangeError);
    expect(() => siguienteTurno(0)).toThrow(RangeError);
    expect(() => siguienteTurno(-3)).toThrow(RangeError);
  });
});

describe("formatTurno", () => {
  it("rellena hasta el ancho del tope, para que no bailen las cifras", () => {
    expect(formatTurno(7)).toBe("07");
    expect(formatTurno(47)).toBe("47");
    expect(formatTurno(7, 999)).toBe("007");
    expect(formatTurno(7, 9)).toBe("7");
  });

  it("agrega el prefijo M si es un turno de mesa", () => {
    expect(formatTurno(7, 99, true)).toBe("M07");
    expect(formatTurno(47, 99, true)).toBe("M47");
  });
});
