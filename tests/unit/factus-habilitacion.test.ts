import { describe, expect, it } from "vitest";
import {
  documentosRestantes,
  esConsumidorFinal,
  faltantesParaFacturar,
  puedeFacturarElectronicamente,
  type ConfigFiscal,
} from "@/lib/billing/factus-habilitacion";

/** Un negocio con todo en regla. Cada prueba le quita una cosa. */
const COMPLETO: ConfigFiscal = {
  facturacionElectronicaHabilitada: true,
  paquetesDocumentosDisponibles: 500,
  documentosEmitidosConsumidos: 20,
  factusClientId: "cli_123",
  factusClientSecret: "sec_123",
  factusUsername: "bar@demo.co",
  factusPassword: "clave",
  factusNumberingRangeId: 8,
  municipalityCode: "05001",
};

describe("puedeFacturarElectronicamente", () => {
  it("con todo cargado, puede", () => {
    expect(puedeFacturarElectronicamente(COMPLETO)).toBe(true);
    expect(faltantesParaFacturar(COMPLETO)).toEqual([]);
  });

  it("sin habilitar, no puede aunque tenga todo lo demás", () => {
    const config = { ...COMPLETO, facturacionElectronicaHabilitada: false };
    expect(puedeFacturarElectronicamente(config)).toBe(false);
    // Un solo mensaje: no tiene sentido pedirle credenciales a quien todavía no
    // contrató el módulo.
    expect(faltantesParaFacturar(config)).toHaveLength(1);
  });

  it("habilitado pero sin credenciales, no puede y las nombra todas", () => {
    const config: ConfigFiscal = {
      ...COMPLETO,
      factusClientId: null,
      factusClientSecret: null,
      factusUsername: null,
      factusPassword: null,
    };
    expect(puedeFacturarElectronicamente(config)).toBe(false);
    expect(faltantesParaFacturar(config)).toHaveLength(4);
  });

  it("una credencial en blanco cuenta como faltante", () => {
    expect(puedeFacturarElectronicamente({ ...COMPLETO, factusClientSecret: "   " })).toBe(false);
  });

  it("con credenciales pero sin rango de numeración, no puede", () => {
    expect(puedeFacturarElectronicamente({ ...COMPLETO, factusNumberingRangeId: null })).toBe(
      false,
    );
  });

  it("sin municipio, no puede", () => {
    expect(puedeFacturarElectronicamente({ ...COMPLETO, municipalityCode: null })).toBe(false);
  });

  it("con el paquete agotado, no puede", () => {
    const agotado = { ...COMPLETO, paquetesDocumentosDisponibles: 500, documentosEmitidosConsumidos: 500 };
    expect(puedeFacturarElectronicamente(agotado)).toBe(false);
    expect(faltantesParaFacturar(agotado)).toEqual([
      "No quedan documentos disponibles en el paquete.",
    ]);
  });

  it("con el último documento todavía puede", () => {
    const ultimo = { ...COMPLETO, paquetesDocumentosDisponibles: 500, documentosEmitidosConsumidos: 499 };
    expect(puedeFacturarElectronicamente(ultimo)).toBe(true);
  });
});

describe("documentosRestantes", () => {
  it("resta consumidos de disponibles", () => {
    expect(documentosRestantes(COMPLETO)).toBe(480);
  });

  it("nunca es negativo, aunque el conteo se haya pasado", () => {
    expect(
      documentosRestantes({
        ...COMPLETO,
        paquetesDocumentosDisponibles: 10,
        documentosEmitidosConsumidos: 25,
      }),
    ).toBe(0);
  });
});

describe("esConsumidorFinal", () => {
  it("sin documento, es consumidor final", () => {
    expect(esConsumidorFinal({ docNumber: null })).toBe(true);
    expect(esConsumidorFinal({ docNumber: "" })).toBe(true);
    expect(esConsumidorFinal({ docNumber: "  " })).toBe(true);
    expect(esConsumidorFinal({})).toBe(true);
  });

  it("con documento, no lo es", () => {
    expect(esConsumidorFinal({ docNumber: "1017234567" })).toBe(false);
  });
});
