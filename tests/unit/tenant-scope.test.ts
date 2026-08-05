import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOBAL_MODELS, ROOT_TENANT_MODEL, TENANT_MODELS } from "@/lib/db/tenant-models";

/**
 * Prisma 7 no expone el DMMF en tiempo de ejecución, así que la clasificación de
 * modelos de lib/db/tenant-models.ts está escrita a mano. Este test la contrasta
 * contra el schema para que no se pudra: si alguien agrega un modelo con
 * businessId y no lo clasifica, tenantDb lo dejaría pasar sin acotar y este test
 * falla nombrándolo.
 */

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

function modelosDelSchema() {
  const modelos = new Map<string, string>();
  const patron = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  for (const [, nombre, cuerpo] of schema.matchAll(patron)) {
    modelos.set(nombre, cuerpo);
  }

  return modelos;
}

const modelos = modelosDelSchema();

const conBusinessId = new Set(
  [...modelos]
    .filter(([, cuerpo]) => /^\s*businessId\s+String/m.test(cuerpo))
    .map(([nombre]) => nombre),
);

describe("clasificación de modelos para el scoping de inquilino", () => {
  it("el schema se pudo leer", () => {
    expect(modelos.size).toBeGreaterThan(10);
    expect(modelos.has(ROOT_TENANT_MODEL)).toBe(true);
  });

  it("TENANT_MODELS es exactamente el conjunto de modelos con businessId", () => {
    const declarados = [...TENANT_MODELS].sort();
    const reales = [...conBusinessId].sort();

    expect(declarados).toEqual(reales);
  });

  it("GLOBAL_MODELS cubre todo lo que queda, sin inventar modelos", () => {
    const esperados = [...modelos.keys()]
      .filter((nombre) => nombre !== ROOT_TENANT_MODEL && !conBusinessId.has(nombre))
      .sort();

    expect([...GLOBAL_MODELS].sort()).toEqual(esperados);
  });

  it("ningún modelo queda en las dos listas", () => {
    const enAmbas = [...TENANT_MODELS].filter((nombre) => GLOBAL_MODELS.has(nombre));
    expect(enAmbas).toEqual([]);
    expect(TENANT_MODELS.has(ROOT_TENANT_MODEL)).toBe(false);
  });

  it("Business se acota por id, no por businessId", () => {
    expect(conBusinessId.has(ROOT_TENANT_MODEL)).toBe(false);
  });
});

describe("invariantes del schema que sostienen las reglas del proyecto", () => {
  it("todo instante es Timestamptz(3)", () => {
    // Un DateTime sin @db.Timestamptz(3) se guarda como timestamp sin zona y
    // arruina cualquier cálculo de jornada.
    const sinZona: string[] = [];

    for (const [nombre, cuerpo] of modelos) {
      for (const linea of cuerpo.split("\n")) {
        const esDateTime = /^\s*\w+\s+DateTime\??\s/.test(linea);
        if (!esDateTime) continue;
        if (linea.includes("@db.Timestamptz(3)") || linea.includes("@db.Date")) continue;
        sinZona.push(`${nombre}: ${linea.trim()}`);
      }
    }

    expect(sinZona).toEqual([]);
  });

  it("el único DateTime sin hora es el día de negocio", () => {
    const fechas: string[] = [];

    for (const [nombre, cuerpo] of modelos) {
      for (const linea of cuerpo.split("\n")) {
        if (!linea.includes("@db.Date")) continue;
        const campo = /^\s*(\w+)\s+DateTime/.exec(linea)?.[1];
        fechas.push(`${nombre}.${campo}`);
      }
    }

    expect(fechas).toEqual(["Order.businessDate", "CashSession.businessDate"]);
  });

  it("no hay dinero en Decimal, BigInt ni Float", () => {
    // El dinero es Int en pesos enteros: ni Decimal ni BigInt cruzan el límite
    // RSC → Client Component.
    expect(schema).not.toMatch(/^\s*\w+\s+(Decimal|BigInt|Float)\b/m);
  });

  it("todo campo de dinero se llama ...Cop y es Int", () => {
    const malTipados: string[] = [];

    for (const [nombre, cuerpo] of modelos) {
      for (const linea of cuerpo.split("\n")) {
        const match = /^\s*(\w*Cop)\s+(\w+)/.exec(linea);
        if (match && match[2] !== "Int") {
          malTipados.push(`${nombre}.${match[1]}: ${match[2]}`);
        }
      }
    }

    expect(malTipados).toEqual([]);
  });
});
