import { describe, expect, it } from "vitest";
import {
  contrasenaEsValida,
  evaluarContrasena,
  LARGO_MAXIMO,
  LARGO_MINIMO,
  LARGO_MINIMO_SUPERADMIN,
  mensajeDeContrasena,
} from "@/lib/auth/reglas-contrasena";

/** Qué requisitos quedaron sin cumplir, por id. */
const faltantes = (valor: string) =>
  evaluarContrasena(valor)
    .filter((r) => !r.cumple)
    .map((r) => r.id);

describe("evaluarContrasena", () => {
  it("devuelve siempre los cinco requisitos, en orden", () => {
    // La pantalla los pinta como lista fija: si alguno apareciera solo cuando
    // falla, la lista saltaría de tamaño en cada tecla.
    expect(evaluarContrasena("").map((r) => r.id)).toEqual([
      "largo",
      "mayuscula",
      "minuscula",
      "numero",
      "simbolo",
    ]);
    expect(evaluarContrasena("Bar123!").map((r) => r.id)).toHaveLength(5);
  });

  it("acepta una contraseña que cumple las cuatro clases y el largo", () => {
    expect(faltantes("Platlia123!")).toEqual([]);
    expect(contrasenaEsValida("Platlia123!")).toBe(true);
  });

  it("rechaza la que motivó subir el mínimo a 10", () => {
    // `Bar123!` cumple mayúscula, minúscula, número y símbolo, y son 7
    // caracteres. Sin el mínimo, exigir composición no cambiaría nada.
    expect(faltantes("Bar123!")).toEqual(["largo"]);
  });

  it("señala exactamente lo que falta, no un rechazo genérico", () => {
    expect(faltantes("todominuscula1!")).toEqual(["mayuscula"]);
    expect(faltantes("TODOMAYUSCULA1!")).toEqual(["minuscula"]);
    expect(faltantes("SinNumeros!!!!")).toEqual(["numero"]);
    expect(faltantes("SinSimbolos123")).toEqual(["simbolo"]);
  });

  it("cuenta el espacio como símbolo", () => {
    // Una frase larga es de lo más fuerte que alguien puede elegir; que no
    // calificara por no tener un `!` sería absurdo.
    expect(contrasenaEsValida("Mi bar en la 70")).toBe(true);
  });

  it("no confunde una letra acentuada con un símbolo", () => {
    // En un teclado español la ñ y las tildes son letras. Si contaran como
    // símbolo, "Contraseña1" pasaría sin tener ninguno.
    expect(faltantes("Contraseña1")).toEqual(["simbolo"]);
  });

  it("respeta el borde exacto del largo", () => {
    const base = "Aa1!";
    const justo = base + "x".repeat(LARGO_MINIMO - base.length);
    expect(justo).toHaveLength(LARGO_MINIMO);
    expect(contrasenaEsValida(justo)).toBe(true);
    expect(contrasenaEsValida(justo.slice(0, -1))).toBe(false);
  });

  it("rechaza por arriba del tope", () => {
    // El tope no es una regla de fuerza: argon2 cuesta a propósito, así que una
    // entrada enorme es una forma barata de hacer trabajar al servidor.
    const enorme = "Aa1!" + "x".repeat(LARGO_MAXIMO);
    expect(contrasenaEsValida(enorme)).toBe(false);
    expect(mensajeDeContrasena(enorme)).toBe("La contraseña es demasiado larga.");
  });
});

describe("contrasenaEsValida y mensajeDeContrasena no discrepan", () => {
  it("hay mensaje exactamente cuando la contraseña no vale", () => {
    // Son dos caminos hacia la misma decisión —uno alimenta al esquema y el
    // otro al texto— y separarse sería rechazar sin decir por qué, o al revés.
    const casos = [
      "",
      "corta1!",
      "Bar123!",
      "todominuscula1!",
      "SinSimbolos123",
      "Platlia123!",
      "Mi bar en la 70",
    ];
    for (const caso of casos) {
      expect(mensajeDeContrasena(caso) === null).toBe(contrasenaEsValida(caso));
    }
  });

  it("el mensaje nombra lo que falta", () => {
    expect(mensajeDeContrasena("todominuscula1!")).toContain("una mayúscula");
    expect(mensajeDeContrasena("corta1!")).toContain("10 caracteres");
  });
});

describe("el mínimo del superadministrador", () => {
  it("es más largo, pero exige exactamente las mismas clases", () => {
    // Antes esta cuenta pedía 12 caracteres y NADA más, así que la más poderosa
    // del sistema aceptaba doce letras seguidas mientras a un cajero se le
    // exigía un símbolo. Sube el largo; los requisitos son los mismos.
    expect(LARGO_MINIMO_SUPERADMIN).toBeGreaterThan(LARGO_MINIMO);
    expect(contrasenaEsValida("contraseñalarga", LARGO_MINIMO_SUPERADMIN)).toBe(false);
  });

  it("rechaza la que le alcanzaría a un usuario normal", () => {
    const once = "Aa1!" + "x".repeat(LARGO_MINIMO_SUPERADMIN - 5);
    expect(once).toHaveLength(LARGO_MINIMO_SUPERADMIN - 1);
    expect(contrasenaEsValida(once)).toBe(true);
    expect(contrasenaEsValida(once, LARGO_MINIMO_SUPERADMIN)).toBe(false);
  });

  it("la lista que ve la pantalla nombra el mínimo que se le pide", () => {
    // Sin esto el campo del superadministrador marcaría en verde a los 10 y el
    // servidor rechazaría a los 11, que es la peor versión del formulario.
    const [largo] = evaluarContrasena("", LARGO_MINIMO_SUPERADMIN);
    expect(largo.etiqueta).toContain(String(LARGO_MINIMO_SUPERADMIN));
  });
});
