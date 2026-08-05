import { describe, expect, it } from "vitest";
import { puedeQuitarSuperAdmin } from "@/lib/auth/reglas-superadmin";

const ana = { userId: "u-ana" };
const julian = { userId: "u-julian" };

describe("puedeQuitarSuperAdmin", () => {
  it("nadie se quita el acceso a sí mismo", () => {
    expect(puedeQuitarSuperAdmin(ana, ana, 3).permitido).toBe(false);
  });

  it("no se puede quitar al último superadministrador", () => {
    expect(puedeQuitarSuperAdmin(ana, julian, 1).permitido).toBe(false);
  });

  it("un superadministrador le quita el acceso a otro si quedan más", () => {
    expect(puedeQuitarSuperAdmin(ana, julian, 2).permitido).toBe(true);
  });

  it("no hay jerarquía: cualquiera actúa sobre cualquiera, salvo las dos excepciones", () => {
    expect(puedeQuitarSuperAdmin(julian, ana, 5).permitido).toBe(true);
  });
});
