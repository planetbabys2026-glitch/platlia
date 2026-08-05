import { describe, expect, it } from "vitest";
import {
  puedeAsignarRol,
  puedeCambiarEstado,
  puedeCambiarRol,
  puedeRestablecerContrasena,
} from "@/lib/auth/reglas-equipo";

const dueno = { userId: "u-dueno", role: "PROPIETARIO" as const };
const admin = { userId: "u-admin", role: "ADMINISTRADOR" as const };
const cajero = { userId: "u-cajero", role: "CAJERO" as const };

const objetivo = (role: "PROPIETARIO" | "ADMINISTRADOR" | "CAJERO" | "MESERO", id = "u-otro") => ({
  userId: id,
  role,
  active: true,
});

describe("puedeAsignarRol", () => {
  it("solo un propietario nombra propietarios", () => {
    // Sin esta regla, un administrador se asciende solo y el dueño pierde el
    // control de su propio negocio.
    expect(puedeAsignarRol(dueno, "PROPIETARIO").permitido).toBe(true);
    expect(puedeAsignarRol(admin, "PROPIETARIO").permitido).toBe(false);
  });

  it("el administrador reparte los demás roles", () => {
    expect(puedeAsignarRol(admin, "CAJERO").permitido).toBe(true);
    expect(puedeAsignarRol(admin, "MESERO").permitido).toBe(true);
  });

  it("un cajero no administra el equipo", () => {
    expect(puedeAsignarRol(cajero, "MESERO").permitido).toBe(false);
  });
});

describe("puedeCambiarRol", () => {
  it("nadie se cambia el rol a sí mismo", () => {
    const yo = objetivo("PROPIETARIO", dueno.userId);
    expect(puedeCambiarRol(dueno, yo, "CAJERO", 2).permitido).toBe(false);
  });

  it("no se degrada al último propietario", () => {
    const otroDueno = objetivo("PROPIETARIO");
    expect(puedeCambiarRol(dueno, otroDueno, "CAJERO", 1)).toMatchObject({
      permitido: false,
      motivo: expect.stringMatching(/único propietario/),
    });
  });

  it("con dos propietarios sí se puede degradar a uno", () => {
    expect(puedeCambiarRol(dueno, objetivo("PROPIETARIO"), "ADMINISTRADOR", 2).permitido).toBe(
      true,
    );
  });

  it("un administrador no toca a un propietario", () => {
    expect(puedeCambiarRol(admin, objetivo("PROPIETARIO"), "CAJERO", 2).permitido).toBe(false);
  });

  it("un administrador sí acomoda al resto del personal", () => {
    expect(puedeCambiarRol(admin, objetivo("MESERO"), "CAJERO", 1).permitido).toBe(true);
  });
});

describe("puedeCambiarEstado", () => {
  it("nadie se da de baja a sí mismo", () => {
    expect(
      puedeCambiarEstado(dueno, objetivo("PROPIETARIO", dueno.userId), false, 2).permitido,
    ).toBe(false);
  });

  it("no se da de baja al último propietario", () => {
    expect(puedeCambiarEstado(dueno, objetivo("PROPIETARIO"), false, 1).permitido).toBe(false);
  });

  it("volver a habilitar al último propietario sí se puede", () => {
    // El tope solo aplica al dar de baja: reactivar nunca deja al negocio sin dueño.
    expect(puedeCambiarEstado(dueno, objetivo("PROPIETARIO"), true, 1).permitido).toBe(true);
  });

  it("un administrador da de baja al personal pero no al propietario", () => {
    expect(puedeCambiarEstado(admin, objetivo("MESERO"), false, 1).permitido).toBe(true);
    expect(puedeCambiarEstado(admin, objetivo("PROPIETARIO"), false, 2).permitido).toBe(false);
  });

  it("un mesero no administra a nadie", () => {
    expect(
      puedeCambiarEstado({ userId: "u-mesero", role: "MESERO" }, objetivo("CAJERO"), false, 1)
        .permitido,
    ).toBe(false);
  });
});

describe("puedeRestablecerContrasena", () => {
  it("cambiarse la propia siempre se puede", () => {
    expect(
      puedeRestablecerContrasena(admin, objetivo("ADMINISTRADOR", admin.userId)).permitido,
    ).toBe(true);
  });

  it("un administrador no le cambia la contraseña al propietario", () => {
    // Equivaldría a quedarse con el negocio.
    expect(puedeRestablecerContrasena(admin, objetivo("PROPIETARIO")).permitido).toBe(false);
  });

  it("el propietario sí puede con cualquiera", () => {
    expect(puedeRestablecerContrasena(dueno, objetivo("PROPIETARIO")).permitido).toBe(true);
    expect(puedeRestablecerContrasena(dueno, objetivo("MESERO")).permitido).toBe(true);
  });

  it("un cajero no le cambia la contraseña a nadie", () => {
    expect(puedeRestablecerContrasena(cajero, objetivo("MESERO")).permitido).toBe(false);
  });
});
