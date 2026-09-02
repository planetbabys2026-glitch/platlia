import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://platlia.com" },
}));
vi.mock("@/lib/billing/lista", () => ({
  preciosVigentes: async () => ({
    vigente: { principalCop: 50000, adicionalCop: 30000, tramos: [] },
    base: null,
  }),
}));

import { GET } from "@/app/llms.txt/route";

describe("formato del archivo llms.txt", () => {
  it("cumple con las especificaciones de llmstxt.org y Lighthouse Agentic Web", async () => {
    const respuesta = await GET();
    expect(respuesta.status).toBe(200);

    const texto = await respuesta.text();

    // 1. Debe contener un encabezado H1 (# Platlia)
    expect(texto).toMatch(/^#\s+.+/m);

    // 2. Debe contener una descripción en cita de bloque (> ...)
    expect(texto).toMatch(/^>\s+.+/m);

    // 3. Debe tener secciones H2 (## ...)
    const seccionesH2 = texto.match(/^##\s+.+/gm);
    expect(seccionesH2).not.toBeNull();
    expect(seccionesH2!.length).toBeGreaterThanOrEqual(2);

    // 4. DEBE contener vínculos en formato Markdown: [Texto](URL)
    const enlacesMarkdown = texto.match(/\[([^\]]+)\]\(([^)]+)\)/g);
    expect(enlacesMarkdown).not.toBeNull();
    expect(enlacesMarkdown!.length).toBeGreaterThanOrEqual(3);

    // 5. Las URLs principales deben ser absolutas (comienzan con http://, https:// o mailto:)
    const urls = Array.from(texto.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)).map((m) => m[2]);
    const urlsAbsolutas = urls.filter((u) => u?.startsWith("http") || u?.startsWith("mailto:"));
    expect(urlsAbsolutas.length).toBeGreaterThanOrEqual(3);
  });
});
