import { afterEach, describe, expect, it } from "vitest";
import { baseApuntada, exigirBaseBorrable } from "@/lib/db/base-local";

const LOCAL = "postgresql://u:p@localhost:5432/platlia";
const REMOTA = "postgresql://u:p@76.13.113.31:5446/platliadb26";

afterEach(() => {
  delete process.env.CONFIRMO_ARRASAR_BASE;
});

describe("a qué base apunta la URL", () => {
  it("saca host, puerto y nombre sin la contraseña", () => {
    expect(baseApuntada(REMOTA)).toEqual({
      host: "76.13.113.31",
      puerto: "5446",
      nombre: "platliadb26",
      local: false,
    });
  });

  it("reconoce las formas de decir 'esta máquina'", () => {
    for (const host of ["localhost", "127.0.0.1", "0.0.0.0"]) {
      expect(baseApuntada(`postgresql://u:p@${host}:5432/x`).local).toBe(true);
    }
  });

  /**
   * Ante la duda no se borra. Una URL ilegible tratada como local sería la peor
   * combinación posible: la guarda callada justo cuando no entiende nada.
   */
  it("una URL que no se puede leer cuenta como remota", () => {
    expect(baseApuntada("no-es-una-url").local).toBe(false);
  });
});

describe("la guarda de los scripts que borran", () => {
  it("deja pasar una base local", () => {
    expect(() => exigirBaseBorrable(LOCAL, "El seed")).not.toThrow();
  });

  /**
   * El caso real: `NODE_ENV` vale "development" en el portátil apunte
   * `DATABASE_URL` a donde apunte, así que la guarda vieja —que miraba el
   * proceso— estaba apagada justo acá.
   */
  it("frena una base remota, aunque NODE_ENV sea development", () => {
    expect(() => exigirBaseBorrable(REMOTA, "El seed")).toThrow(/base remota/i);
  });

  it("el mensaje nombra la base y el host, que es lo que hay que mirar", () => {
    expect(() => exigirBaseBorrable(REMOTA, "El seed")).toThrow(/platliadb26/);
    expect(() => exigirBaseBorrable(REMOTA, "El seed")).toThrow(/76\.13\.113\.31/);
  });

  it("se puede arrasar una remota nombrándola a propósito", () => {
    process.env.CONFIRMO_ARRASAR_BASE = "platliadb26";
    expect(() => exigirBaseBorrable(REMOTA, "El seed")).not.toThrow();
  });

  /**
   * Tiene que coincidir EXACTO: si no, una variable que alguien dejó puesta en el
   * `.env` para resetear la base de pruebas seguiría autorizando el borrado el día
   * que esa URL apunte a producción.
   */
  it("una confirmación de otra base no autoriza esta", () => {
    process.env.CONFIRMO_ARRASAR_BASE = "platlia_pruebas";
    expect(() => exigirBaseBorrable(REMOTA, "El seed")).toThrow(/base remota/i);
  });
});
