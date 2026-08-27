import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma/enums";
import {
  obtenerPermisosRol,
  PERMISOS_POR_DEFECTO,
  SECCIONES_SISTEMA,
  tienePermisoSeccion,
} from "@/lib/auth/permisos-roles";

describe("Lógica de permisos por rol", () => {
  it("el propietario tiene todos los permisos activos independientemente de cualquier JSON", () => {
    const raw = JSON.stringify({
      [Role.PROPIETARIO]: { salon_pos: false, caja: false },
    });
    const permisos = obtenerPermisosRol(Role.PROPIETARIO, raw);
    for (const seccion of SECCIONES_SISTEMA) {
      expect(permisos[seccion.id]).toBe(true);
      expect(tienePermisoSeccion(Role.PROPIETARIO, seccion.id, raw)).toBe(true);
    }
  });

  it("el mesero tiene valores por defecto para operar en salón pero no en caja o administración", () => {
    const permisos = obtenerPermisosRol(Role.MESERO);
    expect(permisos.salon_pos).toBe(true);
    expect(permisos.turnero).toBe(true);
    expect(permisos.caja).toBe(false);
    expect(permisos.cocina).toBe(false);
    expect(permisos.domicilios).toBe(false);
    expect(permisos.inventario).toBe(false);
    expect(permisos.informes).toBe(false);
    expect(permisos.carta).toBe(false);
    expect(permisos.salon_plano).toBe(false);
    expect(permisos.equipo).toBe(false);
    expect(permisos.configuracion).toBe(false);
  });

  it("el cocinero tiene monitor de cocina por defecto", () => {
    const permisos = obtenerPermisosRol(Role.COCINA);
    expect(permisos.cocina).toBe(true);
    expect(permisos.turnero).toBe(true);
    expect(permisos.salon_pos).toBe(false);
    expect(permisos.caja).toBe(false);
  });

  it("el cajero tiene caja, salón/pos, domicilios e informes por defecto", () => {
    const permisos = obtenerPermisosRol(Role.CAJERO);
    expect(permisos.caja).toBe(true);
    expect(permisos.salon_pos).toBe(true);
    expect(permisos.domicilios).toBe(true);
    expect(permisos.informes).toBe(true);
    expect(permisos.turnero).toBe(true);
    expect(permisos.cocina).toBe(false);
    expect(permisos.carta).toBe(false);
  });

  it("el administrador tiene todas las secciones habilitadas por defecto", () => {
    const permisos = obtenerPermisosRol(Role.ADMINISTRADOR);
    for (const seccion of SECCIONES_SISTEMA) {
      expect(permisos[seccion.id]).toBe(true);
    }
  });

  it("aplica sobreescrituras personalizadas guardadas por el propietario", () => {
    // Por ejemplo, el propietario le da acceso a inventario al mesero y le quita domicilios al cajero
    const raw = JSON.stringify({
      [Role.MESERO]: { inventario: true, cocina: true },
      [Role.CAJERO]: { domicilios: false },
    });

    const permisosMesero = obtenerPermisosRol(Role.MESERO, raw);
    expect(permisosMesero.inventario).toBe(true);
    expect(permisosMesero.cocina).toBe(true);
    expect(permisosMesero.salon_pos).toBe(true); // default conservado
    expect(permisosMesero.caja).toBe(false); // default conservado

    const permisosCajero = obtenerPermisosRol(Role.CAJERO, raw);
    expect(permisosCajero.domicilios).toBe(false);
    expect(permisosCajero.caja).toBe(true); // default conservado
  });

  it("maneja JSON corrupto o nulo cayendo limpiamente en los valores por defecto", () => {
    const permisos1 = obtenerPermisosRol(Role.MESERO, "invalid-json{");
    expect(permisos1).toEqual(PERMISOS_POR_DEFECTO[Role.MESERO]);

    const permisos2 = obtenerPermisosRol(Role.MESERO, null);
    expect(permisos2).toEqual(PERMISOS_POR_DEFECTO[Role.MESERO]);

    const permisos3 = obtenerPermisosRol(Role.MESERO, "");
    expect(permisos3).toEqual(PERMISOS_POR_DEFECTO[Role.MESERO]);
  });
});

describe("el salón y el punto de venta son permisos distintos", () => {
  /**
   * Un mesero toma pedidos en la mesa pero no vende de mostrador. Con un solo
   * permiso para las dos cosas, dejarle el salón le dejaba también el POS.
   */
  it("el mesero entra al salón y no al POS", () => {
    expect(tienePermisoSeccion(Role.MESERO, "salon_pos")).toBe(true);
    expect(tienePermisoSeccion(Role.MESERO, "pos")).toBe(false);
  });

  it("quien cobra sí vende sin mesa", () => {
    for (const rol of [Role.CAJERO, Role.ADMINISTRADOR, Role.PROPIETARIO]) {
      expect(tienePermisoSeccion(rol, "pos")).toBe(true);
    }
  });

  it("la cocina no entra a ninguno de los dos", () => {
    expect(tienePermisoSeccion(Role.COCINA, "salon_pos")).toBe(false);
    expect(tienePermisoSeccion(Role.COCINA, "pos")).toBe(false);
  });

  it("un permiso que la empresa nunca guardó cae al valor por defecto del rol", () => {
    // Es lo que hace que agregar `pos` no necesite migrar a nadie: el JSON viejo
    // no lo trae y el mesero igual queda sin mostrador.
    const jsonViejo = JSON.stringify({ [Role.MESERO]: { salon_pos: true } });
    expect(tienePermisoSeccion(Role.MESERO, "pos", jsonViejo)).toBe(false);
    expect(tienePermisoSeccion(Role.MESERO, "salon_pos", jsonViejo)).toBe(true);
  });
});
