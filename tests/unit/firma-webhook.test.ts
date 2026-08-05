import { describe, expect, it } from "vitest";
import {
  construirManifiesto,
  firmarParaPruebas,
  parsearCabeceraFirma,
  verificarFirma,
} from "@/lib/billing/firma";

const SECRETO = "un-secreto-de-webhook-cualquiera";
const AHORA = new Date("2026-08-05T12:00:00Z");
const TS = Math.floor(AHORA.getTime() / 1000).toString();
const REQUEST_ID = "b7f8c2de-1c0a-4c5e-9f77-0f1e2d3c4b5a";
const DATA_ID = "1234567890";

function cabeceraValida(overrides: Partial<Parameters<typeof firmarParaPruebas>[0]> = {}) {
  return firmarParaPruebas({
    dataId: DATA_ID,
    requestId: REQUEST_ID,
    ts: TS,
    secreto: SECRETO,
    ...overrides,
  });
}

describe("parsearCabeceraFirma", () => {
  it("lee ts y v1", () => {
    expect(parsearCabeceraFirma("ts=123,v1=abc")).toEqual({ ts: "123", v1: "abc" });
  });

  it("tolera espacios y orden invertido", () => {
    expect(parsearCabeceraFirma(" v1=abc , ts=123 ")).toEqual({ ts: "123", v1: "abc" });
  });

  it("una cabecera a medias no es media firma: es ninguna", () => {
    expect(parsearCabeceraFirma("ts=123")).toBeNull();
    expect(parsearCabeceraFirma("v1=abc")).toBeNull();
    expect(parsearCabeceraFirma("")).toBeNull();
    expect(parsearCabeceraFirma(null)).toBeNull();
  });
});

describe("construirManifiesto", () => {
  it("arma la plantilla exacta que firma MercadoPago", () => {
    expect(construirManifiesto({ dataId: "999", requestId: "req-1", ts: "1700" })).toBe(
      "id:999;request-id:req-1;ts:1700;",
    );
  });

  it("pasa el id a minúsculas", () => {
    // Del otro lado se arma en minúsculas: una diferencia de mayúsculas tumbaría
    // un aviso legítimo.
    expect(construirManifiesto({ dataId: "ABC123", requestId: "r", ts: "1" })).toContain(
      "id:abc123;",
    );
  });

  it("sin request-id deja el campo vacío, no lo omite", () => {
    expect(construirManifiesto({ dataId: "1", requestId: null, ts: "2" })).toBe(
      "id:1;request-id:;ts:2;",
    );
  });
});

describe("verificarFirma", () => {
  it("acepta un aviso legítimo", () => {
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida(),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado).toEqual({ valida: true });
  });

  it("rechaza una firma hecha con otro secreto", () => {
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida({ secreto: "otro-secreto" }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado.valida).toBe(false);
  });

  it("rechaza si cambia el id del pago", () => {
    // El caso que importa: alguien toma un aviso real y le cambia el pago.
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida(),
      requestId: REQUEST_ID,
      dataId: "9999999999",
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado.valida).toBe(false);
  });

  it("rechaza si cambia el request-id", () => {
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida(),
      requestId: "otro-request-id",
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado.valida).toBe(false);
  });

  it("rechaza un reenvío viejo", () => {
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida(),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: new Date(AHORA.getTime() + 20 * 60_000),
    });
    expect(resultado).toMatchObject({ valida: false, motivo: expect.stringMatching(/ventana/) });
  });

  it("rechaza una firma del futuro lejano", () => {
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida(),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: new Date(AHORA.getTime() - 20 * 60_000),
    });
    expect(resultado.valida).toBe(false);
  });

  it("acepta el ts en milisegundos, que no está garantizado por contrato", () => {
    const resultado = verificarFirma({
      cabeceraFirma: cabeceraValida({ ts: AHORA.getTime().toString() }),
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado.valida).toBe(true);
  });

  it("no acepta v1 con mayúsculas distintas como excusa para fallar", () => {
    const cabecera = cabeceraValida();
    const enMayusculas = cabecera.replace(/v1=(.*)$/, (_, v) => `v1=${v.toUpperCase()}`);
    const resultado = verificarFirma({
      cabeceraFirma: enMayusculas,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado.valida).toBe(true);
  });

  it("rechaza cuando faltan piezas", () => {
    const base = {
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    };
    expect(verificarFirma({ ...base, cabeceraFirma: null }).valida).toBe(false);
    expect(verificarFirma({ ...base, cabeceraFirma: "basura" }).valida).toBe(false);
    expect(
      verificarFirma({ ...base, cabeceraFirma: cabeceraValida(), dataId: null }).valida,
    ).toBe(false);
    expect(
      verificarFirma({ ...base, cabeceraFirma: cabeceraValida(), secreto: "" }).valida,
    ).toBe(false);
  });

  it("rechaza un ts que no es número", () => {
    const resultado = verificarFirma({
      cabeceraFirma: "ts=ayer,v1=abc",
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
      ahora: AHORA,
    });
    expect(resultado.valida).toBe(false);
  });
});
