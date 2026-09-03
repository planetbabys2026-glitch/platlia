import { describe, expect, it } from "vitest";
import {
  claveDeIntento,
  inicioDeVentana,
  minutosParaReintentar,
  procedencia,
  PROCEDENCIA_DESCONOCIDA,
  superaElCupo,
} from "@/lib/seguridad/reglas-limite";

/** Un objeto con la forma mínima de `Headers`. */
const cabeceras = (mapa: Record<string, string>) => ({
  get: (nombre: string) => mapa[nombre] ?? null,
});

describe("procedencia", () => {
  it("prefiere la cabecera de Cloudflare", () => {
    // Cloudflare la escribe él con la IP real y descarta lo que venga puesto de
    // antes. `x-forwarded-for` lo escribe cualquiera, así que cuando están las
    // dos hay que quedarse con la que no se puede inventar.
    const desde = procedencia(
      cabeceras({ "cf-connecting-ip": "190.0.0.1", "x-forwarded-for": "1.2.3.4" }),
    );
    expect(desde).toBe("190.0.0.1");
  });

  it("usa el primer tramo de x-forwarded-for cuando no hay Cloudflare adelante", () => {
    expect(procedencia(cabeceras({ "x-forwarded-for": "190.0.0.1, 10.0.0.1" }))).toBe("190.0.0.1");
  });

  it("no deja pasar libre a quien no trae ninguna", () => {
    // Si la falta de IP diera vía libre, saltearse el freno sería tan fácil como
    // no mandar la cabecera. Comparten una clave, o sea que comparten el cupo.
    expect(procedencia(cabeceras({}))).toBe(PROCEDENCIA_DESCONOCIDA);
    expect(procedencia(cabeceras({ "x-forwarded-for": "   " }))).toBe(PROCEDENCIA_DESCONOCIDA);
  });
});

describe("claveDeIntento", () => {
  it("separa lo que se intenta de dónde se intenta", () => {
    // Gastar el cupo de ingresar no puede dejar a nadie sin poder registrarse.
    expect(claveDeIntento("ingresar", "1.2.3.4")).not.toBe(claveDeIntento("registro", "1.2.3.4"));
    expect(claveDeIntento("ingresar", "1.2.3.4")).not.toBe(claveDeIntento("ingresar", "5.6.7.8"));
  });
});

describe("inicioDeVentana", () => {
  it("agrupa en tramos fijos del reloj", () => {
    const a = inicioDeVentana(new Date("2026-09-03T10:07:30Z"), 15);
    const b = inicioDeVentana(new Date("2026-09-03T10:14:59Z"), 15);
    expect(a.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(b.toISOString()).toBe(a.toISOString());
  });

  it("cambia de tramo al cruzar el borde, y ahí el conteo arranca solo", () => {
    // Es lo que hace que no haga falta borrar ni reiniciar nada: la ventana
    // nueva es otra fila, con su propio contador en cero.
    const dentro = inicioDeVentana(new Date("2026-09-03T10:14:59Z"), 15);
    const siguiente = inicioDeVentana(new Date("2026-09-03T10:15:00Z"), 15);
    expect(siguiente.getTime()).toBeGreaterThan(dentro.getTime());
    expect(siguiente.toISOString()).toBe("2026-09-03T10:15:00.000Z");
  });
});

describe("superaElCupo", () => {
  it("el intento que iguala el cupo todavía pasa", () => {
    // `intentos` ya viene incrementado por el upsert: el quinto de un cupo de 5
    // es el último que se atiende, y el sexto es el que rebota.
    expect(superaElCupo(5, 5)).toBe(false);
    expect(superaElCupo(6, 5)).toBe(true);
  });
});

describe("minutosParaReintentar", () => {
  it("dice cuánto falta, para poder escribirlo en el mensaje", () => {
    // "Probá de nuevo en un rato" es lo que hace que alguien reintente cada diez
    // segundos.
    const inicio = new Date("2026-09-03T10:00:00Z");
    expect(minutosParaReintentar(inicio, 15, new Date("2026-09-03T10:00:00Z"))).toBe(15);
    expect(minutosParaReintentar(inicio, 15, new Date("2026-09-03T10:10:00Z"))).toBe(5);
  });

  it("nunca dice cero minutos", () => {
    // Redondeado hacia abajo, el último tramo diría "probá en 0 minutos".
    const inicio = new Date("2026-09-03T10:00:00Z");
    expect(minutosParaReintentar(inicio, 15, new Date("2026-09-03T10:14:59Z"))).toBe(1);
  });
});
