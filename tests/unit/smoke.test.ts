import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// Valida que el runner arranca y que vite-tsconfig-paths resuelve el alias "@/".
// Si esto falla, ningún otro test del proyecto va a poder importar nada.
describe("infraestructura de pruebas", () => {
  it("resuelve el alias @/ del proyecto", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("cn descarta clases falsas y resuelve conflictos de Tailwind", () => {
    expect(cn("px-2", false && "px-4", "px-6")).toBe("px-6");
  });
});
