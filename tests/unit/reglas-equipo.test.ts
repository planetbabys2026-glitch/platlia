import { describe, expect, it } from "vitest";
import {
  puedeAsignarRol,
  puedeCambiarEstado,
  puedeCambiarRol,
  puedeRestablecerContrasena,
  puedeRestablecerContrasenaGlobal,
  puedeVincularCuentaExistente,
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

describe("puedeVincularCuentaExistente", () => {
  it("rechaza al dueño de un negocio ajeno", () => {
    // Es la mitad de la cadena que permitía tomarle el negocio a otro: agregarlo
    // como mesero y después resetearle la contraseña, que es global.
    const veredicto = puedeVincularCuentaExistente({ esPropietarioAfuera: true });
    expect(veredicto.permitido).toBe(false);
  });

  it("deja pasar a quien ya trabaja en otra sucursal de la misma cuenta", () => {
    // Este es el caso que el alta tiene que resolver sin fricción: la misma
    // persona en dos sedes del mismo dueño. Ahí no se cruza ninguna frontera:
    // quien da el alta ya controla los dos negocios, así que no cuenta como
    // "propietario afuera".
    expect(puedeVincularCuentaExistente({ esPropietarioAfuera: false }).permitido).toBe(true);
  });

  it("deja pasar al empleado de un negocio ajeno", () => {
    // Un mesero que trabaja en dos restaurantes distintos existe de verdad. Lo
    // que lo protege no es impedir el alta, es que su contraseña ya no se pueda
    // resetear desde acá.
    expect(puedeVincularCuentaExistente({ esPropietarioAfuera: false }).permitido).toBe(true);
  });
});

describe("puedeRestablecerContrasenaGlobal", () => {
  const empleado = objetivo("CAJERO");

  it("deja resetear a quien solo trabaja acá", () => {
    expect(puedeRestablecerContrasenaGlobal(dueno, empleado, false).permitido).toBe(true);
  });

  it("no deja resetear a quien tiene cuentas afuera", () => {
    // La contraseña no es de este negocio, es de la persona: cambiársela le
    // entrega al que la escribió la llave de su otro trabajo.
    const veredicto = puedeRestablecerContrasenaGlobal(dueno, empleado, true);
    expect(veredicto.permitido).toBe(false);
    if (!veredicto.permitido) expect(veredicto.motivo).toContain("enlace de recuperación");
  });

  it("uno siempre puede con la suya, tenga las cuentas que tenga", () => {
    const uno = { userId: dueno.userId, role: "PROPIETARIO" as const, active: true };
    expect(puedeRestablecerContrasenaGlobal(dueno, uno, true).permitido).toBe(true);
  });

  it("no afloja ninguna de las reglas de adentro", () => {
    // Es una capa encima de puedeRestablecerContrasena, no un reemplazo: un
    // administrador sigue sin poder tocar la contraseña de un propietario.
    const propietario = objetivo("PROPIETARIO");
    expect(puedeRestablecerContrasenaGlobal(admin, propietario, false).permitido).toBe(false);
    expect(puedeRestablecerContrasenaGlobal(cajero, empleado, false).permitido).toBe(false);
  });
});
