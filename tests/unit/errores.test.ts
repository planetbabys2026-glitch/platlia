import { describe, expect, it } from "vitest";
import { esVersionVieja } from "@/lib/errores";

/**
 * Lo que decide si la pantalla se recarga sola o le muestra "algo salió mal" a
 * un mesero en mitad del turno. Equivocarse para el lado fácil —no reconocer el
 * error de versión— deja la tablet trabada después de cada despliegue, porque el
 * botón de reintentar vuelve a pedir el archivo que ya no existe.
 */
describe("esVersionVieja", () => {
  it("reconoce el error por su nombre", () => {
    expect(esVersionVieja({ name: "ChunkLoadError", message: "cualquier cosa" })).toBe(true);
  });

  it("reconoce el mensaje de webpack, que es el bundler de este build", () => {
    expect(
      esVersionVieja({
        name: "Error",
        message: "Loading chunk 5562 failed.\n(error: /_next/static/chunks/app/salon/page.js)",
      }),
    ).toBe(true);
  });

  it("reconoce las dos formas del import() dinámico", () => {
    expect(
      esVersionVieja({ name: "TypeError", message: "Failed to fetch dynamically imported module: /x.js" }),
    ).toBe(true);
    expect(
      esVersionVieja({ name: "TypeError", message: "error loading dynamically imported module" }),
    ).toBe(true);
  });

  it("no se deja engañar por un error de verdad", () => {
    // Recargar acá no arregla nada y esconde el problema: el error tiene que
    // llegar a la pantalla con su código de referencia.
    expect(esVersionVieja({ name: "Error", message: "Cannot read properties of undefined" })).toBe(
      false,
    );
    expect(esVersionVieja({ name: "Error", message: "" })).toBe(false);
    expect(esVersionVieja(null)).toBe(false);
  });
});
