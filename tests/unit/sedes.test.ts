import { describe, expect, it } from "vitest";
import { puedeCrearSede } from "@/lib/billing/sedes";

describe("cuándo se puede crear una sede más", () => {
  it("sin cuenta no se crea nada", () => {
    expect(puedeCrearSede(null).permitido).toBe(false);
  });

  it("con cupo libre se permite", () => {
    expect(puedeCrearSede({ status: "ACTIVA", sedes: 1, maxBranches: 2 })).toEqual({
      permitido: true,
    });
  });

  it("sin cupo no se permite, aunque esté paga", () => {
    const v = puedeCrearSede({ status: "ACTIVA", sedes: 1, maxBranches: 1 });
    expect(v.permitido).toBe(false);
    expect(v.permitido === false && v.motivo).toContain("Compralá desde Licencia");
  });

  it("la prueba con cupo de fábrica sigue cubriendo una sola sede", () => {
    const v = puedeCrearSede({ status: "PRUEBA", sedes: 1, maxBranches: 1 });
    expect(v.permitido).toBe(false);
    expect(v.permitido === false && v.motivo).toContain("prueba gratuita cubre una sola sede");
  });

  it("**la prueba CON cupo asignado sí crea la sede**", () => {
    // Es el caso que originó el cambio: el superadministrador le sube el cupo a
    // una cadena en evaluación y antes eso no servía de nada, porque el bloqueo
    // por estado cortaba antes de mirar el cupo.
    expect(puedeCrearSede({ status: "PRUEBA", sedes: 1, maxBranches: 3 })).toEqual({
      permitido: true,
    });
    expect(puedeCrearSede({ status: "PRUEBA", sedes: 2, maxBranches: 3 })).toEqual({
      permitido: true,
    });
  });

  it("el cupo se agota también en prueba", () => {
    expect(puedeCrearSede({ status: "PRUEBA", sedes: 3, maxBranches: 3 }).permitido).toBe(false);
  });

  it("el mensaje de una cadena sin cupo no manda a comprar, manda a escribir", () => {
    const v = puedeCrearSede({ status: "ACTIVA", sedes: 4, maxBranches: 4 });
    expect(v.permitido === false && v.motivo).toContain("tarifa de cadena");
  });
});
