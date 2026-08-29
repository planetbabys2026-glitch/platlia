import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nuestro `robots.txt` no puede contradecir al de Cloudflare.
 *
 * Cloudflare antepone un bloque propio al archivo que sirve la aplicación, y ahí
 * los rastreadores de entrenamiento llevan `Disallow: /`. Nombrarlos acá con
 * `Allow: /` no los desbloquea: deja dos grupos `User-agent` con el mismo nombre
 * diciendo lo opuesto, y con grupos duplicados el comportamiento no está definido
 * igual en todos los rastreadores. La contradicción no daba nada y volvía
 * impredecible el archivo entero.
 *
 * `app/robots.ts` no se puede importar acá: arrastra `lib/env.ts`, que revienta a
 * propósito con `window` definido y los tests corren en jsdom. Se lee como texto,
 * igual que en `sitemap.test.ts`.
 *
 * **Si algún día se apaga el robots.txt gestionado de Cloudflare** (panel → AI
 * Crawl Control), esta prueba es la que hay que actualizar: dejaría de haber
 * conflicto y los de entrenamiento podrían sumarse.
 */
const ROBOTS = readFileSync(join(process.cwd(), "app", "robots.ts"), "utf8");

/** El bloque `const agentesDeIa = [...]`, sin comentarios alrededor. */
function agentesDeclarados(): string[] {
  const m = ROBOTS.match(/const agentesDeIa = \[([^\]]*)\]/);
  expect(m, "no se encontró la lista de agentesDeIa").not.toBeNull();
  return Array.from(m![1]!.matchAll(/"([^"]+)"/g)).map((x) => x[1]!);
}

/** Los que Cloudflare bloquea hoy, verificado contra el archivo en vivo. */
const BLOQUEADOS_POR_CLOUDFLARE = [
  "ClaudeBot",
  "GPTBot",
  "CCBot",
  "Google-Extended",
  "meta-externalagent",
  "Applebot-Extended",
  "Amazonbot",
  "Bytespider",
];

describe("robots.txt", () => {
  it("no nombra a ningún agente que Cloudflare bloquea", () => {
    const declarados = agentesDeclarados();
    const enConflicto = declarados.filter((a) => BLOQUEADOS_POR_CLOUDFLARE.includes(a));
    expect(
      enConflicto,
      `Cloudflare les pone "Disallow: /" a estos y acá se les da "Allow: /": ` +
        `son grupos User-agent duplicados y contradictorios. Si se apagó el ` +
        `robots.txt gestionado en AI Crawl Control, actualizá esta prueba.`,
    ).toEqual([]);
  });

  it("sí nombra a los que contestan en vivo, que Cloudflare deja pasar", () => {
    const declarados = agentesDeclarados();
    // Son los que entran cuando alguien le pregunta a un asistente, y los que
    // arman los índices que esos asistentes consultan.
    for (const agente of ["Claude-User", "ChatGPT-User", "OAI-SearchBot", "PerplexityBot"]) {
      expect(declarados, `falta ${agente}`).toContain(agente);
    }
  });

  it("las pantallas con datos de comensales siguen fuera del índice", () => {
    // Los tiquetes traen nombre y teléfono de gente real.
    for (const ruta of ["/imprimir/", "/superadmin", "/api/"]) {
      expect(ROBOTS, `falta ${ruta} en la lista de prohibidos`).toContain(`"${ruta}"`);
    }
  });

  it("declara el sitemap, que es como un buscador encuentra el resto", () => {
    expect(ROBOTS).toContain("sitemap:");
    expect(ROBOTS).toContain("/sitemap.xml");
  });
});
