import { describe, expect, it } from "vitest";
import { licenciaVigente, tieneRol } from "@/lib/auth/reglas";

const AHORA = new Date("2026-08-04T15:00:00Z");
const enDias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

describe("licenciaVigente", () => {
  it("deja trabajar durante la prueba", () => {
    const estado = licenciaVigente(
      {
        status: "PRUEBA",
        trialEndsAt: enDias(5),
        currentPeriodEnd: enDias(5),
        graceUntil: enDias(8),
      },
      AHORA,
    );

    expect(estado.vigente).toBe(true);
    expect(estado.enGracia).toBe(false);
  });

  it("con el período vencido pero dentro de la gracia, se trabaja y se avisa", () => {
    // El viernes a la noche no se puede dejar a un bar sin poder cobrar porque
    // el cobro automático falló el jueves.
    const estado = licenciaVigente(
      {
        status: "VENCIDA",
        trialEndsAt: null,
        currentPeriodEnd: enDias(-1),
        graceUntil: enDias(2),
      },
      AHORA,
    );

    expect(estado.vigente).toBe(true);
    expect(estado.enGracia).toBe(true);
  });

  it("pasada la gracia, se bloquea", () => {
    const estado = licenciaVigente(
      {
        status: "VENCIDA",
        trialEndsAt: null,
        currentPeriodEnd: enDias(-10),
        graceUntil: enDias(-3),
      },
      AHORA,
    );

    expect(estado.vigente).toBe(false);
    expect(estado.enGracia).toBe(false);
  });

  it("cancelada o suspendida no tiene gracia, aunque la fecha diga otra cosa", () => {
    // Son decisiones tomadas a mano, no accidentes de cobro.
    for (const status of ["CANCELADA", "SUSPENDIDA"]) {
      const estado = licenciaVigente(
        {
          status,
          trialEndsAt: enDias(30),
          currentPeriodEnd: enDias(30),
          graceUntil: enDias(60),
        },
        AHORA,
      );
      expect(estado.vigente).toBe(false);
    }
  });

  it("sin suscripción no se trabaja", () => {
    expect(licenciaVigente(null, AHORA).vigente).toBe(false);
  });

  it("sin fechas tampoco: ante la duda, no se abre", () => {
    const estado = licenciaVigente(
      { status: "ACTIVA", trialEndsAt: null, currentPeriodEnd: null, graceUntil: null },
      AHORA,
    );
    expect(estado.vigente).toBe(false);
  });

  it("cae del lado del bloqueo en el instante exacto del vencimiento", () => {
    const estado = licenciaVigente(
      { status: "ACTIVA", trialEndsAt: null, currentPeriodEnd: AHORA, graceUntil: AHORA },
      AHORA,
    );
    expect(estado.vigente).toBe(false);
  });
});

describe("tieneRol", () => {
  it("el propietario pasa siempre, esté o no en la lista", () => {
    expect(tieneRol("PROPIETARIO", ["CAJERO"])).toBe(true);
    expect(tieneRol("PROPIETARIO", [])).toBe(true);
  });

  it("el resto necesita estar en la lista", () => {
    expect(tieneRol("CAJERO", ["CAJERO", "ADMINISTRADOR"])).toBe(true);
    expect(tieneRol("MESERO", ["CAJERO", "ADMINISTRADOR"])).toBe(false);
    expect(tieneRol("COCINA", [])).toBe(false);
  });

  it("administrador no es comodín: si la acción es solo de caja, no entra", () => {
    expect(tieneRol("ADMINISTRADOR", ["CAJERO"])).toBe(false);
  });
});
