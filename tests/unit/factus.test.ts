import { describe, expect, it } from "vitest";
import { TaxKind } from "@/generated/prisma/enums";
import {
  AJUSTE_MAXIMO_CENTAVOS,
  construirPayloadFactus,
  construirPayloadNotaCredito,
  type DatosFacturaPlatlia,
  mapearDocumentoDian,
  mapearImpuestoDian,
  mapearMedioPagoDian,
  referenciaDeFactura,
  type RenglonParaFacturar,
  totalesDeFactura,
} from "@/lib/billing/factus";
import { computeTaxLine } from "@/lib/tax";

/**
 * La factura tiene que decir lo mismo que la tirilla.
 *
 * Este archivo existe sobre todo por eso: el mapeador nunca se había ejecutado
 * contra la API y mandaba el precio de carta —con el impuesto adentro— como
 * `price`, así que Factus le sumaba el impuesto encima y una cerveza de $5.000 se
 * facturaba en $5.400. Las pruebas de abajo arman renglones con el MISMO
 * `lib/tax.ts` que usa el cobro y verifican que lo que va a calcular Factus cierre
 * contra lo que el cliente pagó.
 */

/** Un renglón como queda congelado en `OrderItem`, calculado con lib/tax.ts. */
function renglon(args: {
  nombre: string;
  precioCarta: number;
  cantidad: number;
  bp: number;
  kind: TaxKind;
  /** En Colombia la carta se publica con el impuesto adentro. */
  impuestoIncluido?: boolean;
  descuentoCop?: number;
}): RenglonParaFacturar & { lineTotalCop: number } {
  const linea = computeTaxLine({
    unitPriceCop: args.precioCarta,
    quantity: args.cantidad,
    taxRateBp: args.bp,
    taxIncluded: args.impuestoIncluido ?? true,
    discountCop: args.descuentoCop,
  });

  return {
    id: `it_${args.nombre}`,
    productId: `prod_${args.nombre}`,
    nameSnapshot: args.nombre,
    quantity: args.cantidad,
    lineSubtotalCop: linea.lineSubtotalCop,
    taxRateBpSnapshot: args.bp,
    taxKindSnapshot: args.kind,
    lineTotalCop: linea.lineTotalCop,
  };
}

function pedido(
  renglones: Array<RenglonParaFacturar & { lineTotalCop: number }>,
  extra: Partial<DatosFacturaPlatlia["order"]> = {},
): DatosFacturaPlatlia {
  const tipCop = extra.tipCop ?? 0;
  const deliveryFeeCop = extra.deliveryFeeCop ?? 0;
  const totalCop = renglones.reduce((s, r) => s + r.lineTotalCop, 0) + tipCop + deliveryFeeCop;

  return {
    order: {
      id: "cmsh123456",
      code: 42,
      totalCop,
      tipCop,
      deliveryFeeCop,
      items: renglones,
      payments: [{ id: "pay1", method: "EFECTIVO", amountCop: totalCop }],
      ...extra,
    },
    business: { name: "Bar Demo", address: "Calle 10 # 40-20", phone: "3001234567" },
    fiscal: { numberingRangeId: 389, municipalityCode: "05001" },
  };
}

describe("mapeos de catálogo DIAN", () => {
  it("traduce el tipo de documento del cliente", () => {
    expect(mapearDocumentoDian("CC")).toBe("13");
    expect(mapearDocumentoDian("NIT")).toBe("31");
    expect(mapearDocumentoDian("CE")).toBe("22");
    expect(mapearDocumentoDian("PASAPORTE")).toBe("41");
    expect(mapearDocumentoDian(null)).toBe("13");
  });

  it("traduce el medio de pago", () => {
    expect(mapearMedioPagoDian("EFECTIVO")).toBe("10");
    expect(mapearMedioPagoDian("TARJETA_DEBITO")).toBe("48");
    expect(mapearMedioPagoDian("TARJETA_CREDITO")).toBe("49");
    expect(mapearMedioPagoDian("NEQUI")).toBe("42");
  });

  it("separa impuesto al consumo de IVA, que es lo que la DIAN pide aparte", () => {
    expect(mapearImpuestoDian(TaxKind.IMPOCONSUMO, 800)).toEqual([{ code: "04", rate: "8.00" }]);
    expect(mapearImpuestoDian(TaxKind.IVA, 1900)).toEqual([{ code: "01", rate: "19.00" }]);
    expect(mapearImpuestoDian(TaxKind.EXENTO, 0)).toEqual([{ code: "01", rate: "0.00" }]);
  });
});

describe("el precio que viaja es la base, no el de carta", () => {
  it("una cerveza de $5.000 con impoconsumo del 8% viaja en 4630, no en 5000", () => {
    // Es el error que hacía facturar $5.400 por algo que se cobró $5.000: la
    // especificación pide el precio unitario SIN impuesto y se mandaba el de carta.
    const datos = pedido([
      renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 1, bp: 800, kind: TaxKind.IMPOCONSUMO }),
    ]);
    const payload = construirPayloadFactus(datos);

    expect(payload.items[0].price).toBe("4630.00");
    expect(payload.items[0].taxes[0]).toEqual({ code: "04", rate: "8.00" });
  });

  it("con precios SIN impuesto incluido la base es el precio de lista", () => {
    const datos = pedido([
      renglon({
        nombre: "Plato",
        precioCarta: 20000,
        cantidad: 1,
        bp: 800,
        kind: TaxKind.IMPOCONSUMO,
        impuestoIncluido: false,
      }),
    ]);
    expect(construirPayloadFactus(datos).items[0].price).toBe("20000.00");
  });
});

describe("los totales cierran contra lo que el cliente pagó", () => {
  /**
   * Factus recalcula el impuesto multiplicando la base por la tarifa; nosotros lo
   * sacamos por diferencia (`lib/tax.ts`) para que base + impuesto dé exacto el
   * precio de carta. Las dos cuentas difieren en centavos, y para eso existe
   * `cash_rounding_amount`. Lo que no puede pasar es que la diferencia se vaya a
   * pesos: ahí ya no es redondeo, es un error de mapeo.
   */
  const centavosPorRenglon = 100;

  it("un pedido simple cuadra al peso", () => {
    const datos = pedido([
      renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 1, bp: 800, kind: TaxKind.IMPOCONSUMO }),
    ]);
    const totales = totalesDeFactura(datos);

    expect(totales.pagadoCentavos).toBe(datos.order.totalCop * 100);
    expect(Math.abs(totales.ajusteCentavos)).toBeLessThan(centavosPorRenglon);
  });

  it("con dos tarifas distintas en el mismo pedido", () => {
    const datos = pedido([
      renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 3, bp: 800, kind: TaxKind.IMPOCONSUMO }),
      renglon({ nombre: "Gaseosa", precioCarta: 4000, cantidad: 2, bp: 1900, kind: TaxKind.IVA }),
      renglon({ nombre: "Pan", precioCarta: 2000, cantidad: 1, bp: 0, kind: TaxKind.EXENTO }),
    ]);
    const totales = totalesDeFactura(datos);

    expect(totales.pagadoCentavos).toBe(datos.order.totalCop * 100);
    expect(Math.abs(totales.ajusteCentavos)).toBeLessThan(3 * centavosPorRenglon);
  });

  it("con descuento por renglón", () => {
    const datos = pedido([
      renglon({
        nombre: "Combo",
        precioCarta: 30000,
        cantidad: 2,
        bp: 800,
        kind: TaxKind.IMPOCONSUMO,
        descuentoCop: 6000,
      }),
    ]);
    const totales = totalesDeFactura(datos);

    expect(totales.pagadoCentavos).toBe(datos.order.totalCop * 100);
    expect(Math.abs(totales.ajusteCentavos)).toBeLessThan(centavosPorRenglon);
  });

  it("con propina: viaja como renglón sin impuesto y el ajuste sigue siendo de centavos", () => {
    // Sin mandar la propina, los pagos superaban al total de la factura por el
    // valor entero de la propina: $8.000 son 800.000 centavos contra un ajuste que
    // admite 50.000. Toda venta con propina habría sido rechazada.
    const datos = pedido(
      [renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 4, bp: 800, kind: TaxKind.IMPOCONSUMO })],
      { tipCop: 8000 },
    );
    const totales = totalesDeFactura(datos);
    const payload = construirPayloadFactus(datos);

    expect(payload.items).toHaveLength(2);
    expect(payload.items[1].name).toBe("Propina voluntaria");
    expect(payload.items[1].price).toBe("8000.00");
    expect(payload.items[1].taxes[0].rate).toBe("0.00");
    expect(Math.abs(totales.ajusteCentavos)).toBeLessThan(centavosPorRenglon);
  });

  it("el ajuste de redondeo nunca pasa el máximo que admite Factus", () => {
    const datos = pedido(
      [
        renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 12, bp: 800, kind: TaxKind.IMPOCONSUMO }),
        renglon({ nombre: "Plato", precioCarta: 38900, cantidad: 5, bp: 800, kind: TaxKind.IMPOCONSUMO }),
        renglon({ nombre: "Gaseosa", precioCarta: 4500, cantidad: 7, bp: 1900, kind: TaxKind.IVA }),
      ],
      { tipCop: 25000 },
    );
    const totales = totalesDeFactura(datos);
    expect(Math.abs(totales.ajusteCentavos)).toBeLessThan(AJUSTE_MAXIMO_CENTAVOS);
  });

  it("con servicio de domicilio cuadra dentro de la tolerancia y crea el renglón correspondiente", () => {
    const datos = pedido(
      [
        renglon({ nombre: "Hamburguesa", precioCarta: 25000, cantidad: 2, bp: 800, kind: TaxKind.IMPOCONSUMO }),
      ],
      { deliveryFeeCop: 6000, tipCop: 2000 },
    );
    const totales = totalesDeFactura(datos);
    expect(Math.abs(totales.ajusteCentavos)).toBeLessThan(AJUSTE_MAXIMO_CENTAVOS);

    const payload = construirPayloadFactus(datos);
    const itemDomicilio = payload.items.find((it) => it.code_reference === "DOMICILIO");
    expect(itemDomicilio).toBeDefined();
    expect(itemDomicilio?.name).toBe("Servicio de domicilio");
    expect(itemDomicilio?.price).toBe("6000.00");
  });

  it("el ajuste que se manda es exactamente pagado menos total", () => {
    const datos = pedido([
      renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 1, bp: 800, kind: TaxKind.IMPOCONSUMO }),
    ]);
    const totales = totalesDeFactura(datos);
    const payload = construirPayloadFactus(datos);

    expect(payload.cash_rounding_amount).toBe((totales.ajusteCentavos / 100).toFixed(2));
  });

  it("con pago mixto suma los dos pagos", () => {
    const datos = pedido([
      renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 4, bp: 800, kind: TaxKind.IMPOCONSUMO }),
    ]);
    datos.order.payments = [
      { id: "p1", method: "EFECTIVO", amountCop: 10000 },
      { id: "p2", method: "NEQUI", amountCop: 10000 },
    ];

    const payload = construirPayloadFactus(datos);
    expect(payload.payment_details).toHaveLength(2);
    expect(payload.payment_details[0].payment_method_code).toBe("10");
    expect(payload.payment_details[1].payment_method_code).toBe("42");
    expect(totalesDeFactura(datos).pagadoCentavos).toBe(2_000_000);
  });
});

describe("el cliente de la factura", () => {
  const unaCerveza = () =>
    renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 1, bp: 800, kind: TaxKind.IMPOCONSUMO });

  it("sin documento sale a consumidor final", () => {
    const payload = construirPayloadFactus(pedido([unaCerveza()]));

    expect(payload.customer.identification).toBe("222222222222");
    expect(payload.customer.legal_organization_code).toBe("2");
    expect(payload.customer.names).toBe("Consumidor Final");
  });

  it("con NIT es persona jurídica y lleva razón social", () => {
    const payload = construirPayloadFactus(
      pedido([unaCerveza()], {
        customerName: "Inversiones Saja S.A.S.",
        docType: "NIT",
        docNumber: "901234567",
      }),
    );

    expect(payload.customer.identification_document_code).toBe("31");
    expect(payload.customer.identification).toBe("901234567");
    expect(payload.customer.legal_organization_code).toBe("1");
    expect(payload.customer.company).toBe("Inversiones Saja S.A.S.");
  });

  it("solo pide el correo cuando hay uno de verdad", () => {
    // Antes caía a una casilla de Platlia y `send_email` iba siempre en true: eso
    // mandaba a Platlia las facturas de los clientes de todos los negocios.
    const sinCorreo = construirPayloadFactus(pedido([unaCerveza()]));
    expect(sinCorreo.send_email).toBe(false);
    expect(sinCorreo.customer.email).toBeUndefined();

    const conCorreo = construirPayloadFactus(
      pedido([unaCerveza()], { customerEmail: "cliente@correo.com" }),
    );
    expect(conCorreo.send_email).toBe(true);
    expect(conCorreo.customer.email).toBe("cliente@correo.com");
  });
});

describe("el payload", () => {
  const unaCerveza = () =>
    renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 1, bp: 800, kind: TaxKind.IMPOCONSUMO });

  it("la referencia es determinista: dos reintentos son el mismo documento", () => {
    // Llevaba el año en curso, así que un reintento a caballo del 31 de diciembre
    // creaba un documento nuevo para la misma venta.
    expect(referenciaDeFactura("ord_abc")).toBe("FV-ord_abc");
    expect(referenciaDeFactura("ord_abc")).toBe(referenciaDeFactura("ord_abc"));
    expect(referenciaDeFactura("ord_abc", "03")).toBe("NC-ord_abc");
  });

  it("el código del renglón es el del producto, no la posición", () => {
    const payload = construirPayloadFactus(pedido([unaCerveza()]));
    expect(payload.items[0].code_reference).toBe("prod_Cerveza");
  });

  it("recorta la observación a los 250 caracteres del máximo", () => {
    const payload = construirPayloadFactus(pedido([unaCerveza()], { notes: "x".repeat(400) }));
    expect(payload.observation).toHaveLength(250);
  });

  it("lleva el rango de numeración del negocio y el tipo de documento", () => {
    const payload = construirPayloadFactus(pedido([unaCerveza()]));
    expect(payload.document).toBe("01");
    expect(payload.numbering_range_id).toBe(389);
    expect(payload.operation_type).toBe("10");
  });

  it("la nota crédito referencia la factura por bill_number y usa su propio rango", () => {
    // No es una factura con otro `document`: mandarla a /v2/bills/validate con
    // `document: "03"` la rechaza porque ese endpoint solo acepta rangos de
    // factura de venta.
    const datos = pedido([unaCerveza()]);
    const payload = construirPayloadNotaCredito({
      ...datos,
      fiscal: { ...datos.fiscal, numberingRangeIdNotaCredito: 390 },
      facturaNumero: "SETP990002443",
    });

    expect(payload.bill_number).toBe("SETP990002443");
    expect(payload.correction_concept_code).toBe("2");
    expect(payload.customization_id).toBe("20");
    expect(payload.numbering_range_id).toBe(390);
    expect(payload.reference_code).toBe("NC-cmsh123456");
    // Los renglones y el cliente son los mismos que los de la factura.
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].price).toBe("4630.00");
  });
});

describe("el cliente HTTP", () => {
  it("pide el token con las credenciales de la plataforma", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      expect(url.toString()).toBe("https://api-sandbox.factus.com.co/oauth/token");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          token_type: "Bearer",
          expires_in: 86400,
          access_token: "token_123",
          refresh_token: "refresh_456",
        }),
        { status: 200 },
      );
    };

    const { obtenerTokenFactus } = await import("@/lib/billing/factus");
    const res = await obtenerTokenFactus({
      clientId: "cli",
      clientSecret: "sec",
      username: "user@test.com",
      password: "clave",
      baseUrl: "https://api-sandbox.factus.com.co",
    });

    expect(res.access_token).toBe("token_123");
    globalThis.fetch = originalFetch;
  });

  it("emite contra /v2/bills/validate y devuelve número y CUFE", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      expect(url.toString()).toBe("https://api-sandbox.factus.com.co/v2/bills/validate");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          status: "Created",
          data: {
            number: "SETP990002443",
            is_validated: true,
            cufe: "a821f2e05cb1b82e0f74",
            links: {
              qr: "https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=a821",
              public_url: "https://app-sandbox.factus.com.co/documents/bills/SETP990002443",
            },
            totals: { total: "5000.40" },
          },
        }),
        { status: 201 },
      );
    };

    const { enviarFacturaAFactus } = await import("@/lib/billing/factus");
    const payload = construirPayloadFactus(
      pedido([
        renglon({ nombre: "Cerveza", precioCarta: 5000, cantidad: 1, bp: 800, kind: TaxKind.IMPOCONSUMO }),
      ]),
    );

    const res = await enviarFacturaAFactus(
      "token_999",
      payload,
      "https://api-sandbox.factus.com.co",
    );
    expect(res.data?.number).toBe("SETP990002443");
    expect(res.data?.cufe).toBe("a821f2e05cb1b82e0f74");
    expect(res.data?.is_validated).toBe(true);

    globalThis.fetch = originalFetch;
  });

  it("lista los rangos de numeración autorizados", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      expect(url.toString()).toBe("https://api-sandbox.factus.com.co/v2/numbering-ranges");
      return new Response(
        JSON.stringify({ data: [{ id: 389, prefix: "SETP", from: 1, to: 5000, current: 12 }] }),
        { status: 200 },
      );
    };

    const { listarRangosDeNumeracion } = await import("@/lib/billing/factus");
    const rangos = await listarRangosDeNumeracion(
      "token_999",
      "https://api-sandbox.factus.com.co",
    );

    expect(rangos).toHaveLength(1);
    expect(rangos[0].id).toBe(389);
    globalThis.fetch = originalFetch;
  });
});
