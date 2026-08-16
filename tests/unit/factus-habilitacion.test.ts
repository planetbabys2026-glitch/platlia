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
  factusNumberingRangeId: 8,
  municipalityCode: "05001",
};

/** La cuenta de Factus de la plataforma, cargada. */
const PLATAFORMA = true;

describe("puedeFacturarElectronicamente", () => {
  it("con todo cargado, puede", () => {
    expect(puedeFacturarElectronicamente(COMPLETO, PLATAFORMA)).toBe(true);
    expect(faltantesParaFacturar(COMPLETO, PLATAFORMA)).toEqual([]);
  });

  it("sin habilitar, no puede aunque tenga todo lo demás", () => {
    const config = { ...COMPLETO, facturacionElectronicaHabilitada: false };
    expect(puedeFacturarElectronicamente(config, PLATAFORMA)).toBe(false);
    // Un solo mensaje: no tiene sentido enumerarle lo que le falta a quien todavía
    // no contrató el módulo.
    expect(faltantesParaFacturar(config, PLATAFORMA)).toHaveLength(1);
  });

  it("sin la cuenta de Factus de la plataforma, nadie puede facturar", () => {
    // No es un problema del negocio: es que Platlia no tiene sus credenciales
    // cargadas. Se nombra igual, porque si no la pantalla dice "todo listo" y la
    // emisión falla sin explicación.
    expect(puedeFacturarElectronicamente(COMPLETO, false)).toBe(false);
    expect(faltantesParaFacturar(COMPLETO, false)).toEqual([
      "La conexión con Factus no está configurada en la plataforma.",
    ]);
  });

  it("sin rango de numeración, no puede", () => {
    expect(
      puedeFacturarElectronicamente({ ...COMPLETO, factusNumberingRangeId: null }, PLATAFORMA),
    ).toBe(false);
  });

  it("sin municipio, no puede", () => {
    expect(puedeFacturarElectronicamente({ ...COMPLETO, municipalityCode: null }, PLATAFORMA)).toBe(
      false,
    );
  });

  it("con el paquete agotado, no puede", () => {
    const agotado = { ...COMPLETO, paquetesDocumentosDisponibles: 500, documentosEmitidosConsumidos: 500 };
    expect(puedeFacturarElectronicamente(agotado, PLATAFORMA)).toBe(false);
    expect(faltantesParaFacturar(agotado, PLATAFORMA)).toEqual([
      "No quedan documentos disponibles en el paquete.",
    ]);
  });

  it("con el último documento todavía puede", () => {
    const ultimo = { ...COMPLETO, paquetesDocumentosDisponibles: 500, documentosEmitidosConsumidos: 499 };
    expect(puedeFacturarElectronicamente(ultimo, PLATAFORMA)).toBe(true);
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
