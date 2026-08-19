import { describe, expect, it } from "vitest";
import { evaluarEstadoNegocio, type ScheduleSettings } from "@/features/negocio/horarios";

describe("evaluarEstadoNegocio", () => {
  const baseSettings: ScheduleSettings = {
    timeZone: "America/Bogota",
    scheduleEnabled: true,
    scheduleOpeningTime: "08:00",
    scheduleClosingTime: "22:00",
    scheduleStatus: "AUTOMATICO",
  };

  it("retorna abierto si el status es ABIERTO forzado", () => {
    const res = evaluarEstadoNegocio({ ...baseSettings, scheduleStatus: "ABIERTO" });
    expect(res.abierto).toBe(true);
  });

  it("retorna cerrado si el status es CERRADO forzado", () => {
    const res = evaluarEstadoNegocio({ ...baseSettings, scheduleStatus: "CERRADO" });
    expect(res.abierto).toBe(false);
    expect(res.razon).toContain("cerrado en este momento");
  });

  it("retorna abierto si el horario no está habilitado y el status es AUTOMATICO", () => {
    const res = evaluarEstadoNegocio({ ...baseSettings, scheduleEnabled: false });
    expect(res.abierto).toBe(true);
  });

  it("evalúa correctamente dentro del horario diurno (ej. 14:00 para 08:00 - 22:00)", () => {
    // 2026-08-19 14:00 en Bogota (UTC-5 -> 19:00 UTC)
    const now = new Date("2026-08-19T19:00:00Z");
    const res = evaluarEstadoNegocio(baseSettings, now);
    expect(res.abierto).toBe(true);
  });

  it("evalúa correctamente fuera del horario diurno (ej. 23:30 para 08:00 - 22:00)", () => {
    // 2026-08-19 23:30 en Bogota (UTC-5 -> 2026-08-20 04:30 UTC)
    const now = new Date("2026-08-20T04:30:00Z");
    const res = evaluarEstadoNegocio(baseSettings, now);
    expect(res.abierto).toBe(false);
    expect(res.razon).toContain("08:00 a 22:00");
  });

  it("soporta horarios nocturnos que cruzan la medianoche (ej: 18:00 a 03:00)", () => {
    const nocturnoSettings: ScheduleSettings = {
      ...baseSettings,
      scheduleOpeningTime: "18:00",
      scheduleClosingTime: "03:00",
    };

    // 01:30 a.m. en Bogota (UTC-5 -> 06:30 UTC)
    const aMadrugada = new Date("2026-08-20T06:30:00Z");
    expect(evaluarEstadoNegocio(nocturnoSettings, aMadrugada).abierto).toBe(true);

    // 12:00 p.m. en Bogota (UTC-5 -> 17:00 UTC)
    const aMediodia = new Date("2026-08-20T17:00:00Z");
    expect(evaluarEstadoNegocio(nocturnoSettings, aMediodia).abierto).toBe(false);
  });
});
