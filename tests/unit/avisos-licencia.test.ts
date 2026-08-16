import { describe, expect, it } from "vitest";
import { avisoQueCorresponde, claveDeAviso } from "@/lib/billing/avisos-licencia";

/**
 * Cuándo sale un correo de vencimiento. El cron corre todas las mañanas, así que
 * la pregunta que decide todo es "¿ya mandé éste?": sin esa marca, el mismo aviso
 * sale tres días seguidos y el cliente aprende a ignorarlo.
 */

const DIA = 86_400_000;

function sub(parcial: Partial<Parameters<typeof avisoQueCorresponde>[0]> = {}) {
  const corte = new Date("2026-09-10T00:00:00Z");
  return {
    status: "ACTIVA",
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: new Date("2026-09-07T00:00:00Z"),
    graceUntil: corte,
    ultimoAvisoClave: null,
    cobroAutomatico: null,
    ...parcial,
  };
}

const CORTE = new Date("2026-09-10T00:00:00Z");

describe("avisoQueCorresponde", () => {
  it("faltando muchos días no dice nada", () => {
    expect(avisoQueCorresponde(sub(), new Date("2026-08-01T00:00:00Z"))).toBeNull();
  });

  it("faltando tres días manda el primer aviso", () => {
    const aviso = avisoQueCorresponde(sub(), new Date(CORTE.getTime() - 3 * DIA));
    expect(aviso?.umbral).toBe(3);
    expect(aviso?.diasRestantes).toBe(3);
  });

  it("faltando dos días sigue correspondiendo el de tres, no el del corte", () => {
    // El umbral es "ya se cruzó", no "es exactamente hoy": si el cron falla un
    // día, el aviso sale al siguiente en vez de perderse.
    const aviso = avisoQueCorresponde(sub(), new Date(CORTE.getTime() - 2 * DIA));
    expect(aviso?.umbral).toBe(3);
  });

  it("el día del corte manda el segundo", () => {
    const aviso = avisoQueCorresponde(sub(), CORTE);
    expect(aviso?.umbral).toBe(0);
    expect(aviso?.diasRestantes).toBe(0);
  });

  it("ya cortado hace días sigue siendo el aviso del corte", () => {
    const aviso = avisoQueCorresponde(sub(), new Date(CORTE.getTime() + 5 * DIA));
    expect(aviso?.umbral).toBe(0);
  });

  it("no repite el aviso que ya mandó", () => {
    const yaMandado = sub({ ultimoAvisoClave: claveDeAviso(CORTE, 3) });
    expect(avisoQueCorresponde(yaMandado, new Date(CORTE.getTime() - 2 * DIA))).toBeNull();
  });

  it("pero después del de tres sí manda el del corte", () => {
    const yaMandado = sub({ ultimoAvisoClave: claveDeAviso(CORTE, 3) });
    const aviso = avisoQueCorresponde(yaMandado, CORTE);
    expect(aviso?.umbral).toBe(0);
  });

  it("al renovarse la licencia los avisos vuelven a salir solos", () => {
    // La clave lleva la fecha de corte adentro: al moverse, la marca vieja deja
    // de coincidir sin que nadie tenga que limpiarla.
    const nuevoCorte = new Date("2026-10-10T00:00:00Z");
    const renovada = sub({
      graceUntil: nuevoCorte,
      currentPeriodEnd: new Date("2026-10-07T00:00:00Z"),
      ultimoAvisoClave: claveDeAviso(CORTE, 0),
    });
    const aviso = avisoQueCorresponde(renovada, new Date(nuevoCorte.getTime() - 3 * DIA));
    expect(aviso?.umbral).toBe(3);
  });

  it("con cobro automático encendido no avisa", () => {
    // Se le va a cobrar solo: decirle "te quedan 3 días" es asustarlo sin motivo.
    const auto = sub({ cobroAutomatico: "MENSUAL" });
    expect(avisoQueCorresponde(auto, new Date(CORTE.getTime() - 3 * DIA))).toBeNull();
  });

  it("no avisa sobre lo que alguien decidió a mano", () => {
    for (const status of ["CANCELADA", "SUSPENDIDA"]) {
      expect(avisoQueCorresponde(sub({ status }), CORTE)).toBeNull();
    }
  });

  it("sin fechas no hay nada que avisar", () => {
    const vacia = sub({ currentPeriodEnd: null, graceUntil: null, trialEndsAt: null });
    expect(avisoQueCorresponde(vacia, CORTE)).toBeNull();
  });

  it("también avisa durante la prueba", () => {
    // Es cuando más importa: son siete días y sin gracia.
    const prueba = sub({
      status: "PRUEBA",
      trialEndsAt: CORTE,
      currentPeriodEnd: CORTE,
      graceUntil: CORTE,
    });
    const aviso = avisoQueCorresponde(prueba, new Date(CORTE.getTime() - 3 * DIA));
    expect(aviso?.umbral).toBe(3);
  });
});
