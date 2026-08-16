/**
 * Mapeador de Facturación Electrónica DIAN para la API de Factus.
 *
 * Mapea los modelos internos de Platlia (`Order`, `OrderItem`, `Business`, `TaxRate`)
 * a la estructura JSON requerida por la API de Factus Colombia.
 * 
 * Reglas de Platlia aplicadas:
 * - El dinero interno son pesos enteros (Int). Factus los requiere como string con decimales (ej. "83300.00").
 * - Las tarifas de impuestos internas son puntos básicos (Int, 800 = 8.00%). Factus requiere string de porcentaje (ej. "8.00").
 * - Códigos de Impuesto DIAN: "01" (IVA), "04" (Impuesto Nacional al Consumo - INC), "00" (Exento).
 */

import { TaxKind } from "@/generated/prisma/enums";
import { CONSUMIDOR_FINAL, esConsumidorFinal } from "@/lib/billing/factus-habilitacion";

export type FactusItemTax = {
  code: string; // "01" (IVA), "04" (INC)
  rate: string; // "8.00", "19.00"
};

export type FactusItem = {
  code_reference: string;
  name: string;
  quantity: string;
  discount_rate: string;
  price: string;
  unit_measure_code: string;
  standard_code: string;
  taxes: FactusItemTax[];
};

export type FactusPaymentDetail = {
  payment_form: string; // "1" (Contado), "2" (Crédito)
  payment_method_code: string; // "10" (Efectivo), "48" (Tarjeta Débito), "49" (Tarjeta Crédito), "42" (Transferencia)
  reference_code: string;
  amount: string;
  due_date?: string;
};

export type FactusCustomer = {
  identification_document_code: string; // "13" (CC), "31" (NIT), "22" (CE)
  identification: string;
  dv?: string;
  company?: string;
  trade_name?: string;
  names?: string;
  address: string;
  email: string;
  phone: string;
  legal_organization_code: string; // "1" (Persona Jurídica), "2" (Persona Natural)
  tribute_code: string; // "ZZ" (No aplica / Responsable de INC)
  country_code: string; // "CO"
  responsibilities: string[]; // ["R-99-PN"]
  municipality_code: string; // Ej: "05001" (Medellín), "11001" (Bogotá)
};

export type FactusPayload = {
  reference_code: string;
  created_time?: string;
  document: string; // "01" (Factura Electrónica de Venta)
  numbering_range_id: number;
  operation_type: string; // "10" (Estándar)
  send_email?: boolean;
  observation: string;
  payment_details: FactusPaymentDetail[];
  cash_rounding_amount: string;
  customer: FactusCustomer;
  items: FactusItem[];
};

export type DatosFacturaPlatlia = {
  order: {
    id: string;
    dailyNumber: number;
    channel: string;
    notes?: string | null;
    totalCop: number;
    cashRoundingCop: number;
    customerName?: string | null;
    customerDocType?: string | null;
    customerDocNumber?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    customerEmail?: string | null;
    items: Array<{
      id: string;
      productName: string;
      quantity: number;
      unitPriceCop: number;
      taxKind: TaxKind;
      taxRateBp: number;
    }>;
    payments: Array<{
      id: string;
      method: string;
      amountCop: number;
    }>;
  };
  business: {
    name: string;
    address?: string | null;
    phone?: string | null;
    municipalityCode?: string | null; // Ej: "05001"
  };
  numberingRangeId: number;
};

/** Mapea el tipo de documento del cliente al código oficial de la DIAN */
export function mapearDocumentoDian(docType?: string | null): string {
  switch (docType?.toUpperCase()) {
    case "NIT":
      return "31";
    case "CE":
      return "22";
    case "PASAPORTE":
      return "41";
    case "CC":
    default:
      return "13"; // Cédula de Ciudadanía por defecto
  }
}

/** Mapea el medio de pago en Platlia al código oficial DIAN en Factus */
export function mapearMedioPagoDian(method: string): string {
  switch (method.toUpperCase()) {
    case "EFECTIVO":
      return "10";
    case "TARJETA_DEBITO":
      return "48";
    case "TARJETA":
    case "TARJETA_CREDITO":
      return "49";
    case "NEQUI":
    case "DAVIPLATA":
    case "BANCOLOMBIA":
    case "TRANSFERENCIA":
    default:
      return "42"; // Consignación / Transferencia bancaria
  }
}

/** Mapea el tipo de impuesto interno de Platlia al código oficial DIAN */
export function mapearImpuestoDian(taxKind: TaxKind, taxRateBp: number): FactusItemTax[] {
  if (taxRateBp === 0 || taxKind === TaxKind.EXENTO) {
    return [{ code: "01", rate: "0.00" }];
  }

  const rateStr = (taxRateBp / 100).toFixed(2); // 800 -> "8.00", 1900 -> "19.00"

  if (taxKind === TaxKind.IMPOCONSUMO) {
    return [{ code: "04", rate: rateStr }]; // "04" es INC (Impuesto Nacional al Consumo)
  }

  // IVA por defecto ("01")
  return [{ code: "01", rate: rateStr }];
}

/**
 * Convierte un pedido completo de Platlia a la estructura JSON oficial de Factus Colombia.
 */
export function construirPayloadFactus(datos: DatosFacturaPlatlia): FactusPayload {
  const { order, business, numberingRangeId } = datos;

  // 1. Cliente (Si no se especificó documento, se asigna Consumidor Final 222222222222 según la DIAN)
  const aConsumidorFinal = esConsumidorFinal({ docNumber: order.customerDocNumber });
  const docCode = aConsumidorFinal
    ? CONSUMIDOR_FINAL.codigoDocumento
    : mapearDocumentoDian(order.customerDocType);
  const docNum = aConsumidorFinal ? CONSUMIDOR_FINAL.documento : order.customerDocNumber!.trim();
  // `customerName` es la etiqueta de la cuenta ("Andrés", "Cuenta 2"), no un
  // nombre fiscal: solo se usa cuando de verdad hay un documento al cual atarlo.
  const nombreCliente = aConsumidorFinal
    ? CONSUMIDOR_FINAL.nombre
    : order.customerName?.trim() || "Cliente General";

  const esJuridica = docCode === "31";

  const customer: FactusCustomer = {
    identification_document_code: docCode,
    identification: docNum,
    legal_organization_code: esJuridica ? "1" : "2", // "1" Jurídica si es NIT, "2" Natural
    ...(esJuridica
      ? { company: nombreCliente, trade_name: nombreCliente }
      : { names: nombreCliente }),
    address: order.customerAddress?.trim() || business.address?.trim() || "Colombia",
    email: order.customerEmail?.trim() || "facturacion@platlia.com",
    phone: order.customerPhone?.trim() || business.phone?.trim() || "3000000000",
    tribute_code: "ZZ",
    country_code: "CO",
    responsibilities: ["R-99-PN"],
    municipality_code: business.municipalityCode || "05001", // Medellín por defecto
  };

  // 2. Detalle de Ítems
  const items: FactusItem[] = order.items.map((item, index) => ({
    code_reference: `ITEM-${(index + 1).toString().padStart(3, "0")}`,
    name: item.productName,
    quantity: item.quantity.toFixed(2),
    discount_rate: "0.00",
    price: item.unitPriceCop.toFixed(2),
    unit_measure_code: "94", // Unidad estándar DIAN
    standard_code: "999",
    taxes: mapearImpuestoDian(item.taxKind, item.taxRateBp),
  }));

  // 3. Detalles de Pago
  const paymentDetails: FactusPaymentDetail[] = order.payments.map((p) => ({
    payment_form: "1", // Contado
    payment_method_code: mapearMedioPagoDian(p.method),
    reference_code: `PAGO-${p.id.slice(-6)}`,
    amount: p.amountCop.toFixed(2),
  }));

  // Si no hay detalle de pagos explícitos, se genera pago único de Contado en Efectivo por el total
  if (paymentDetails.length === 0) {
    paymentDetails.push({
      payment_form: "1",
      payment_method_code: "10", // Efectivo
      reference_code: `PAGO-${order.id.slice(-6)}`,
      amount: order.totalCop.toFixed(2),
    });
  }

  return {
    reference_code: `FACT-${new Date().getFullYear()}-${order.id.slice(-6).toUpperCase()}`,
    document: "01",
    numbering_range_id: numberingRangeId,
    operation_type: "10",
    send_email: true,
    observation: order.notes?.trim() || `Pedido #${order.dailyNumber} en Platlia POS`,
    payment_details: paymentDetails,
    cash_rounding_amount: (order.cashRoundingCop ?? 0).toFixed(2),
    customer,
    items,
  };
}

export type ConfigFactus = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  baseUrl?: string;
};

export type RespuestaTokenFactus = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

/**
 * Autenticación OAuth2 con la API de Factus (Sandbox / Producción).
 * Utiliza fetch nativo y URLSearchParams (100% compatible con Next.js 15 Edge & Node).
 */
export async function obtenerTokenFactus(config: ConfigFactus): Promise<RespuestaTokenFactus> {
  const baseUrl = config.baseUrl || "https://api-sandbox.factus.com.co";
  const endpoint = `${baseUrl}/oauth/token`;

  const params = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password: config.password,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error de autenticación Factus (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as RespuestaTokenFactus;
  return data;
}

export type RespuestaFactusValidacion = {
  status?: string;
  message?: string;
  data?: {
    reference_code?: string;
    number?: string;
    is_validated?: boolean;
    validated_at?: string;
    cufe?: string;
    links?: {
      qr?: string;
      public_url?: string;
    };
    totals?: {
      prepayment_amount?: string;
      gross_amount?: string;
      taxable_amount?: string;
      tax_amount?: string;
      surcharge_amount?: string;
      total?: string;
    };
    errors?: Record<string, unknown>;
  };
};

/**
 * Valida y emite la factura electrónica en la API v2 de Factus.
 */
export async function enviarFacturaAFactus(
  token: string,
  payload: FactusPayload,
  baseUrl = "https://api-sandbox.factus.com.co"
): Promise<RespuestaFactusValidacion> {
  const endpoint = `${baseUrl}/v2/bills/validate`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error enviando factura a Factus v2 (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as RespuestaFactusValidacion;
}

/**
 * Obtiene el enlace de descarga o la información del PDF de una factura emitida.
 */
export async function descargarPdfFactura(
  token: string,
  billNumber: string,
  baseUrl = "https://api-sandbox.factus.com.co"
) {
  const endpoint = `${baseUrl}/v2/bills/${encodeURIComponent(billNumber)}/download-pdf`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error descargando PDF de Factus (${response.status}): ${errorBody}`);
  }

  return await response.json();
}
