import { describe, expect, it } from "vitest";
import { componerRecibo, type PedidoDeRecibo } from "@/lib/printing/recibo";
import { ANCHO_POR_PAPEL } from "@/lib/printing/ticket";

/**
 * El ancho del recibo, que es lo que decide si la última columna sale impresa.
 *
 * `componerRecibo` rellena con espacios hasta un ancho en CARACTERES y la
 * pantalla de impresión fija la caja en `ch`: un renglón que se pase aunque sea
 * de uno se sale del cabezal, y lo que se pierde es siempre lo mismo —la columna
 * de la derecha, donde van los importes—. No se ve en pantalla: se descubre en el
 * papel que se le entrega al cliente.
 */

const NEGOCIO = {
  name: "Bar de la Esquina y Compañía Limitada",
  legalName: "Comercializadora Gastronómica del Valle de Aburrá S.A.S.",
  taxId: "901.234.567-8",
  address: "Carrera 45 # 12-30, Barrio Provenza, Medellín",
  phone: "300 123 4567",
};

/** A propósito con lo más largo de cada cosa: nombres, cifras y notas. */
const PEDIDO: PedidoDeRecibo = {
  code: 1042,
  type: "MESA",
  status: "PAGADA",
  turnNumber: 97,
  openedAt: new Date("2026-09-02T23:15:00Z"),
  closedAt: new Date("2026-09-02T23:58:00Z"),
  customerName: "María Fernanda Restrepo de la Cuesta",
  customerEmail: "maria.fernanda.restrepo@correodelargonombre.com",
  customerPhone: "3001234567",
  deliveryAddress: "Calle 10 Sur # 43-100 Torre 4 Apto 1502",
  docType: "NIT",
  docNumber: "901234567",
  guestsCount: 4,
  subtotalCop: 1_296_296,
  discountCop: 15_000,
  deliveryFeeCop: 8_000,
  tipCop: 129_630,
  totalCop: 1_500_000,
  paidCop: 1_500_000,
  facturaElectronicaNumero: "SETP990000123",
  facturaElectronicaCufe: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  notaCreditoNumero: null,
  table: { name: "Terraza 12" },
  openedBy: { name: "Jhon Alexánder Torres" },
  items: [
    {
      quantity: 12,
      nameSnapshot: "Bandeja paisa completa con chicharrón extra",
      unitPriceCop: 108_024,
      lineSubtotalCop: 1_200_000,
      lineTaxCop: 96_296,
      lineTotalCop: 1_296_296,
      notes: "sin cebolla, término medio, la carne bien asada",
      taxRateNameSnapshot: "Impuesto al consumo",
      taxRateBpSnapshot: 800,
      modifiers: [{ optionNameSnapshot: "Arroz extra con verduras", priceDeltaCopSnapshot: 3_000 }],
    },
  ],
  payments: [
    { method: "EFECTIVO", amountCop: 1_500_000, tenderedCop: 2_000_000, changeCop: 500_000 },
  ],
  fiado: null,
};

describe("ningún renglón del recibo se pasa del rollo", () => {
  for (const [papel, ancho] of Object.entries(ANCHO_POR_PAPEL)) {
    it(`${papel}: todo cabe en ${ancho} caracteres`, () => {
      const lineas = componerRecibo(PEDIDO, NEGOCIO, {
        ancho,
        zona: "America/Bogota",
        receiptHeader: "Régimen simple de tributación · Resolución DIAN 18764000000000",
        receiptFooter: "¡Gracias por su visita!\nLa propina es voluntaria y equivale al 10%.",
      });

      for (const linea of lineas) {
        expect(linea.length, `se pasa por ${linea.length - ancho}: "${linea}"`).toBeLessThanOrEqual(
          ancho,
        );
      }
    });
  }

  /**
   * El caso que motivó la prueba: los importes van pegados al borde derecho, así
   * que si algo se sale, se pierden ellos. Un total de siete cifras es lo más
   * ancho que puede aparecer en un bar.
   */
  it("el total con siete cifras queda dentro y termina en el borde", () => {
    const lineas = componerRecibo(PEDIDO, NEGOCIO, { ancho: 48, zona: "America/Bogota" });
    const total = lineas.find((l) => l.startsWith("TOTAL"));

    expect(total).toBeDefined();
    expect(total!.length).toBeLessThanOrEqual(48);
    expect(total!).toContain("$1.500.000");
    // Pegado a la derecha: sin espacios sobrantes al final.
    expect(total!).toBe(total!.trimEnd());
  });

  it("un fiado también cabe, con el nombre y el teléfono del deudor", () => {
    const lineas = componerRecibo(
      {
        ...PEDIDO,
        fiado: {
          saldoCop: 1_500_000,
          deudor: { nombre: "María Fernanda Restrepo de la Cuesta", telefono: "3001234567" },
        },
      },
      NEGOCIO,
      { ancho: 48, zona: "America/Bogota" },
    );

    for (const linea of lineas) expect(linea.length).toBeLessThanOrEqual(48);
    expect(lineas.join("\n")).toContain("FIADO");
  });
});

/**
 * La caja alta se aplica en el composer y no en el CSS de la pantalla de
 * impresión, porque de acá salen LOS DOS papeles: el del navegador y el que
 * arma la cola térmica. Puesta solo en la pantalla, el mismo pedido salía en
 * mayúsculas por un camino y en texto mixto por el otro.
 */
describe("el recibo sale en mayúsculas por los dos caminos", () => {
  const lineas = componerRecibo(PEDIDO, NEGOCIO, {
    ancho: ANCHO_POR_PAPEL.MM80,
    zona: "America/Bogota",
    turnNumberMax: 99,
  });

  it("no queda una sola minúscula", () => {
    const conMinusculas = lineas.filter((l) => l !== l.toUpperCase());
    expect(conMinusculas).toEqual([]);
  });

  it("los acentos se conservan, que es lo que CP858 sabe imprimir", () => {
    expect(lineas.join("\n")).toContain("MARÍA FERNANDA");
  });

  it("y las columnas siguen cuadrando: la caja alta no cambia el largo", () => {
    for (const linea of lineas) {
      expect(linea.length).toBeLessThanOrEqual(ANCHO_POR_PAPEL.MM80);
    }
  });
});
