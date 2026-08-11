import { describe, expect, it } from "vitest";
import { TaxKind } from "@/generated/prisma/enums";
import {
  construirPayloadFactus,
  mapearDocumentoDian,
  mapearImpuestoDian,
  mapearMedioPagoDian,
} from "@/lib/billing/factus";

describe("Integración API Factus DIAN", () => {
  it("mapea documentos DIAN correctamente", () => {
    expect(mapearDocumentoDian("CC")).toBe("13");
    expect(mapearDocumentoDian("NIT")).toBe("31");
    expect(mapearDocumentoDian("CE")).toBe("22");
    expect(mapearDocumentoDian(null)).toBe("13");
  });

  it("mapea medios de pago DIAN correctamente", () => {
    expect(mapearMedioPagoDian("EFECTIVO")).toBe("10");
    expect(mapearMedioPagoDian("NEQUI")).toBe("42");
    expect(mapearMedioPagoDian("TARJETA")).toBe("49");
  });

  it("mapea Impuesto al Consumo (INC 8%) y Exento de Platlia", () => {
    const inc = mapearImpuestoDian(TaxKind.IMPOCONSUMO, 800);
    expect(inc).toEqual([{ code: "04", rate: "8.00" }]);

    const exento = mapearImpuestoDian(TaxKind.EXENTO, 0);
    expect(exento).toEqual([{ code: "01", rate: "0.00" }]);
  });

  it("construye un payload Factus perfecto asignando Consumidor Final si no hay datos de cliente", () => {
    const payload = construirPayloadFactus({
      order: {
        id: "cmsh123456",
        dailyNumber: 42,
        channel: "POS",
        notes: "Sin cebolla",
        totalCop: 50000,
        cashRoundingCop: 0,
        items: [
          {
            id: "item1",
            productName: "Hamburguesa Especial",
            quantity: 2,
            unitPriceCop: 25000,
            taxKind: TaxKind.IMPOCONSUMO,
            taxRateBp: 800,
          },
        ],
        payments: [
          {
            id: "pay1",
            method: "EFECTIVO",
            amountCop: 50000,
          },
        ],
      },
      business: {
        name: "Platlia Burger",
        address: "Calle 10 # 40-20",
        phone: "3001234567",
      },
      numberingRangeId: 389,
    });

    expect(payload.document).toBe("01");
    expect(payload.numbering_range_id).toBe(389);
    expect(payload.send_email).toBe(true);
    expect(payload.customer.identification).toBe("222222222222"); // Consumidor Final
    expect(payload.customer.legal_organization_code).toBe("2"); // Persona Natural
    expect(payload.customer.names).toBe("Consumidor Final");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].name).toBe("Hamburguesa Especial");
    expect(payload.items[0].taxes[0]).toEqual({ code: "04", rate: "8.00" });
    expect(payload.payment_details[0].payment_method_code).toBe("10"); // Efectivo
  });

  it("asigna company y legal_organization_code 1 cuando el cliente es NIT (Persona Jurídica)", () => {
    const payload = construirPayloadFactus({
      order: {
        id: "cmsh789012",
        dailyNumber: 15,
        channel: "POS",
        totalCop: 100000,
        cashRoundingCop: 0,
        customerName: "Inversiones Saja S.A.S.",
        customerDocType: "NIT",
        customerDocNumber: "901234567",
        items: [
          {
            id: "item2",
            productName: "Cena Empresarial",
            quantity: 1,
            unitPriceCop: 100000,
            taxKind: TaxKind.IVA,
            taxRateBp: 1900,
          },
        ],
        payments: [],
      },
      business: {
        name: "Platlia Restaurante",
      },
      numberingRangeId: 389,
    });

    expect(payload.customer.identification_document_code).toBe("31");
    expect(payload.customer.legal_organization_code).toBe("1"); // Persona Jurídica
    expect(payload.customer.company).toBe("Inversiones Saja S.A.S.");
  });

  it("obtiene la estructura adecuada para la autenticación OAuth2 con Factus", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      expect(url.toString()).toContain("/oauth/token");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      });
      return new Response(
        JSON.stringify({
          token_type: "Bearer",
          expires_in: 86400,
          access_token: "mock_access_token_123",
          refresh_token: "mock_refresh_token_456",
        }),
        { status: 200 },
      );
    };

    const { obtenerTokenFactus } = await import("@/lib/billing/factus");
    const res = await obtenerTokenFactus({
      clientId: "test_client",
      clientSecret: "test_secret",
      username: "user@test.com",
      password: "password123",
    });

    expect(res.access_token).toBe("mock_access_token_123");
    expect(res.token_type).toBe("Bearer");

    globalThis.fetch = originalFetch;
  });

  it("envía la factura a la API v2 de Factus (/v2/bills/validate) correctamente", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      expect(url.toString()).toContain("/v2/bills/validate");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        Authorization: "Bearer mock_token_999",
        Accept: "application/json",
        "Content-Type": "application/json",
      });

      return new Response(
        JSON.stringify({
          status: "Created",
          message: "Documento registrado y validado con éxito",
          data: {
            reference_code: "FACT-2026-0001",
            number: "SETP990002443",
            is_validated: true,
            cufe: "a821f2e05cb1b82e0f74",
            links: {
              qr: "https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=a821f2e05cb1b82e0f74",
              public_url: "https://app-sandbox.factus.com.co/documents/bills/SETP990002443",
            },
          },
        }),
        { status: 201 },
      );
    };

    const { enviarFacturaAFactus } = await import("@/lib/billing/factus");
    const payload = construirPayloadFactus({
      order: {
        id: "ord001",
        dailyNumber: 1,
        channel: "POS",
        totalCop: 20000,
        cashRoundingCop: 0,
        items: [],
        payments: [],
      },
      business: { name: "Mi Bar" },
      numberingRangeId: 389,
    });

    const res = await enviarFacturaAFactus("mock_token_999", payload);
    expect(res.status).toBe("Created");
    expect(res.data?.number).toBe("SETP990002443");
    expect(res.data?.cufe).toBe("a821f2e05cb1b82e0f74");
    expect(res.data?.is_validated).toBe(true);
    expect(res.data?.links?.public_url).toBe("https://app-sandbox.factus.com.co/documents/bills/SETP990002443");

    globalThis.fetch = originalFetch;
  });
});
