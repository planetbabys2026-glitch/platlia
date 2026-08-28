import { describe, expect, it } from "vitest";
import {
  FIRMA_AL_LLEGAR,
  formatDuracion,
  MARCA_AL_LLEGAR,
  promedioMs,
  puedeMarcarListo,
  SIGUIENTE_ESTADO,
  tiemposDeRenglon,
} from "@/features/cocina/reglas";

const ANDRES = "usr_andres";
const CAMILA = "usr_camila";

describe("el camino de un renglón por la cocina", () => {
  it("avanza de a un paso y no se salta a entregado", () => {
    expect(SIGUIENTE_ESTADO.PENDIENTE).toBe("EN_PREPARACION");
    expect(SIGUIENTE_ESTADO.EN_PREPARACION).toBe("LISTO");
    expect(SIGUIENTE_ESTADO.LISTO).toBe("ENTREGADO");
  });

  it("de entregado y de anulado no se sale", () => {
    expect(SIGUIENTE_ESTADO.ENTREGADO).toBeUndefined();
    expect(SIGUIENTE_ESTADO.ANULADO).toBeUndefined();
  });

  it("cada paso deja su marca, y empezar deja la que faltaba", () => {
    expect(MARCA_AL_LLEGAR.EN_PREPARACION).toBe("startedAt");
    expect(MARCA_AL_LLEGAR.LISTO).toBe("readyAt");
    expect(MARCA_AL_LLEGAR.ENTREGADO).toBe("deliveredAt");
  });

  it("solo empezar y terminar llevan firma: levantar el plato lo hace cualquiera", () => {
    expect(FIRMA_AL_LLEGAR.EN_PREPARACION).toBe("startedById");
    expect(FIRMA_AL_LLEGAR.LISTO).toBe("readyById");
    expect(FIRMA_AL_LLEGAR.ENTREGADO).toBeNull();
  });
});

describe("solo el cocinero que lo tomó lo marca listo", () => {
  it("quien lo tomó puede", () => {
    const v = puedeMarcarListo({ startedById: ANDRES, actorId: ANDRES, actorRole: "COCINA" });
    expect(v).toEqual({ permitido: true, esRelevo: false });
  });

  it("otro cocinero no puede, y el mensaje dice a quién ir a buscar", () => {
    const v = puedeMarcarListo({
      startedById: ANDRES,
      actorId: CAMILA,
      actorRole: "COCINA",
      nombreDeQuienLoTomo: "Andrés",
    });
    expect(v.permitido).toBe(false);
    expect(v.permitido === false && v.motivo).toContain("Andrés");
  });

  it("tampoco puede un mesero ni un cajero: no son la válvula", () => {
    for (const rol of ["MESERO", "CAJERO"]) {
      expect(
        puedeMarcarListo({ startedById: ANDRES, actorId: CAMILA, actorRole: rol }).permitido,
      ).toBe(false);
    }
  });

  it("un administrador releva, y el relevo queda marcado como tal", () => {
    for (const rol of ["ADMINISTRADOR", "PROPIETARIO"]) {
      expect(
        puedeMarcarListo({ startedById: ANDRES, actorId: CAMILA, actorRole: rol }),
      ).toEqual({ permitido: true, esRelevo: true });
    }
  });

  it("sin dueño lo mueve cualquiera: es lo anterior a la columna, no un plato de nadie", () => {
    // Sin esto, toda comanda anterior a la migración quedaba trabada para siempre.
    expect(
      puedeMarcarListo({ startedById: null, actorId: CAMILA, actorRole: "COCINA" }),
    ).toEqual({ permitido: true, esRelevo: false });
  });

  it("sin nombre a mano el mensaje sigue siendo legible", () => {
    const v = puedeMarcarListo({ startedById: ANDRES, actorId: CAMILA, actorRole: "COCINA" });
    expect(v.permitido === false && v.motivo).toBe(
      "Ese plato lo tomó otra persona: solo esa persona puede marcarlo listo.",
    );
  });
});

describe("los dos tramos de un renglón", () => {
  const enviado = new Date("2026-08-27T18:00:00.000Z");
  const tomado = new Date("2026-08-27T18:04:00.000Z");
  const terminado = new Date("2026-08-27T18:19:00.000Z");

  it("separa lo que esperó de lo que se cocinó", () => {
    expect(
      tiemposDeRenglon({ sentToKitchenAt: enviado, startedAt: tomado, readyAt: terminado }),
    ).toEqual({
      esperaMs: 4 * 60_000,
      preparacionMs: 15 * 60_000,
      totalMs: 19 * 60_000,
    });
  });

  it("sin toque en el KDS los tramos son null, no cero", () => {
    // Un negocio que imprime la comanda en papel no registra ningún toque. Con
    // cero, el informe anunciaría una cocina que sirve al instante.
    expect(
      tiemposDeRenglon({ sentToKitchenAt: enviado, startedAt: null, readyAt: terminado }),
    ).toEqual({ esperaMs: null, preparacionMs: null, totalMs: 19 * 60_000 });
  });

  it("un tramo negativo es null: las marcas quedaron fuera de orden", () => {
    expect(
      tiemposDeRenglon({ sentToKitchenAt: terminado, startedAt: enviado, readyAt: null }),
    ).toMatchObject({ esperaMs: null });
  });

  it("todavía sin terminar no tiene preparación medible", () => {
    expect(
      tiemposDeRenglon({ sentToKitchenAt: enviado, startedAt: tomado, readyAt: null }),
    ).toEqual({ esperaMs: 4 * 60_000, preparacionMs: null, totalMs: null });
  });
});

describe("promedios y formato", () => {
  it("promedia solo lo medible y dice cuántos eran", () => {
    expect(promedioMs([60_000, null, 180_000])).toEqual({ promedioMs: 120_000, medidos: 2 });
  });

  it("sin nada medible no inventa un cero", () => {
    expect(promedioMs([null, null])).toEqual({ promedioMs: null, medidos: 0 });
    expect(promedioMs([])).toEqual({ promedioMs: null, medidos: 0 });
  });

  it("formatDuracion corta en minutos, que es como se habla de una cocina", () => {
    expect(formatDuracion(null)).toBe("—");
    expect(formatDuracion(45_000)).toBe("45 s");
    expect(formatDuracion(4 * 60_000)).toBe("4 min");
    expect(formatDuracion(60 * 60_000)).toBe("1 h");
    expect(formatDuracion(80 * 60_000)).toBe("1 h 20 min");
  });
});
