import { describe, expect, it } from "vitest";
import {
  aplicarPagoAprobado,
  diasParaElCorte,
  estadoSegunFechas,
  type PeriodoSuscripcion,
} from "@/lib/billing/suscripcion";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function sub(parcial: Partial<PeriodoSuscripcion> = {}): PeriodoSuscripcion {
  return {
    status: "ACTIVA",
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    graceUntil: null,
    ...parcial,
  };
}

describe("aplicarPagoAprobado", () => {
  it("encadena el mes nuevo al final del que todavía corre", () => {
    // Paga el 20 con vencimiento el 30: no puede perder esos diez días.
    const nuevo = aplicarPagoAprobado(
      sub({ currentPeriodEnd: new Date("2026-08-30T00:00:00Z") }),
      new Date("2026-08-20T15:00:00Z"),
    );

    expect(iso(nuevo.currentPeriodStart)).toBe("2026-08-30");
    expect(iso(nuevo.currentPeriodEnd)).toBe("2026-09-30");
  });

  it("si ya venció, el mes arranca el día del pago", () => {
    // Cobrarle desde la fecha vieja sería venderle tiempo sin servicio.
    const nuevo = aplicarPagoAprobado(
      sub({ status: "VENCIDA", currentPeriodEnd: new Date("2026-07-01T00:00:00Z") }),
      new Date("2026-08-20T15:00:00Z"),
    );

    expect(iso(nuevo.currentPeriodStart)).toBe("2026-08-20");
    expect(iso(nuevo.currentPeriodEnd)).toBe("2026-09-20");
  });

  it("respeta la prueba sin usar", () => {
    const nuevo = aplicarPagoAprobado(
      sub({ status: "PRUEBA", trialEndsAt: new Date("2026-08-25T00:00:00Z") }),
      new Date("2026-08-20T00:00:00Z"),
    );
    expect(iso(nuevo.currentPeriodEnd)).toBe("2026-09-25");
  });

  it("recorta al último día del mes cuando el día no existe", () => {
    // El 31 de enero más un mes es el 28 de febrero, no el 3 de marzo.
    const nuevo = aplicarPagoAprobado(sub(), new Date("2026-01-31T12:00:00Z"));
    expect(iso(nuevo.currentPeriodEnd)).toBe("2026-02-28");
  });

  it("deja la gracia después del vencimiento", () => {
    const nuevo = aplicarPagoAprobado(sub(), new Date("2026-08-01T00:00:00Z"));
    expect(iso(nuevo.currentPeriodEnd)).toBe("2026-09-01");
    expect(iso(nuevo.graceUntil)).toBe("2026-09-04");
    expect(nuevo.graceUntil > nuevo.currentPeriodEnd).toBe(true);
  });

  it("un pago siempre deja la licencia activa", () => {
    for (const status of ["PRUEBA", "VENCIDA", "ACTIVA"]) {
      expect(aplicarPagoAprobado(sub({ status }), new Date()).status).toBe("ACTIVA");
    }
  });

  it("pagar dos veces suma dos meses, no uno", () => {
    const primero = aplicarPagoAprobado(sub(), new Date("2026-08-01T00:00:00Z"));
    const segundo = aplicarPagoAprobado(
      sub({ currentPeriodEnd: primero.currentPeriodEnd }),
      new Date("2026-08-02T00:00:00Z"),
    );
    expect(iso(segundo.currentPeriodEnd)).toBe("2026-10-01");
  });
});

describe("estadoSegunFechas", () => {
  const ahora = new Date("2026-08-05T12:00:00Z");

  it("dentro del período está activa", () => {
    expect(
      estadoSegunFechas(sub({ currentPeriodEnd: new Date("2026-09-01T00:00:00Z") }), ahora),
    ).toBe("ACTIVA");
  });

  it("la prueba sigue siendo prueba mientras no venza", () => {
    expect(
      estadoSegunFechas(
        sub({ status: "PRUEBA", trialEndsAt: new Date("2026-08-10T00:00:00Z") }),
        ahora,
      ),
    ).toBe("PRUEBA");
  });

  it("vencida pero en gracia: sigue trabajando", () => {
    expect(
      estadoSegunFechas(
        sub({
          currentPeriodEnd: new Date("2026-08-04T00:00:00Z"),
          graceUntil: new Date("2026-08-07T00:00:00Z"),
        }),
        ahora,
      ),
    ).toBe("VENCIDA");
  });

  it("pasada la gracia se suspende", () => {
    expect(
      estadoSegunFechas(
        sub({
          currentPeriodEnd: new Date("2026-07-01T00:00:00Z"),
          graceUntil: new Date("2026-07-04T00:00:00Z"),
        }),
        ahora,
      ),
    ).toBe("SUSPENDIDA");
  });

  it("no revive lo que se decidió a mano", () => {
    // Cancelada o suspendida por soporte no es un accidente de cobro.
    for (const status of ["CANCELADA", "SUSPENDIDA"]) {
      expect(
        estadoSegunFechas(
          sub({ status, currentPeriodEnd: new Date("2027-01-01T00:00:00Z") }),
          ahora,
        ),
      ).toBe(status);
    }
  });

  it("sin fechas no se trabaja", () => {
    expect(estadoSegunFechas(sub(), ahora)).toBe("SUSPENDIDA");
  });
});

describe("diasParaElCorte", () => {
  const ahora = new Date("2026-08-05T00:00:00Z");

  it("cuenta hasta el fin de la gracia", () => {
    expect(
      diasParaElCorte(sub({ graceUntil: new Date("2026-08-08T00:00:00Z") }), ahora),
    ).toBe(3);
  });

  it("da negativo cuando ya se cortó", () => {
    expect(
      diasParaElCorte(sub({ graceUntil: new Date("2026-08-01T00:00:00Z") }), ahora),
    ).toBe(-4);
  });

  it("sin fechas no hay cuenta que dar", () => {
    expect(diasParaElCorte(sub(), ahora)).toBeNull();
  });
});
