/**
 * Factura electrónica DIAN: el mapeador y el cliente HTTP de Factus.
 *
 * Convierte un pedido de Platlia al JSON que espera `POST /v2/bills/validate` y
 * habla con la API. Todo lo que decide QUIÉN puede facturar vive al lado, en
 * `factus-habilitacion.ts`.
 *
 * Tres conversiones que hay que tener presentes:
 *
 *  - El dinero interno son **pesos enteros**. Factus quiere strings con dos
 *    decimales ("83300.00"). Toda la aritmética de acá va en **centavos enteros**
 *    para no arrastrar errores de punto flotante y recién al final se formatea.
 *  - Las tarifas internas son **puntos básicos** (800 = 8%). Factus quiere
 *    porcentaje como string ("8.00").
 *  - En Colombia la carta se publica con el impuesto adentro. La DIAN lo quiere
 *    afuera: `price` es el precio unitario **sin impuesto**, y por eso se manda
 *    la base congelada del renglón y no `unitPriceCop`. Mandar el precio de carta
 *    con el `rate` declarado hace que Factus le sume el impuesto encima y facture
 *    una cerveza de $5.000 en $5.400.
 *
 * La cuenta de Factus es UNA, de la plataforma, y sus credenciales viven en
 * `factus-plataforma.ts` —el único archivo de esta familia que lee el entorno—,
 * para que el mapeador se pueda probar sin servidor. Lo que es de cada negocio es
 * el rango de numeración que la DIAN le autorizó a su NIT.
 */

import { TaxKind } from "@/generated/prisma/enums";
import { CONSUMIDOR_FINAL, esConsumidorFinal } from "@/lib/billing/factus-habilitacion";

// ─────────────────────────────────────────────────────────────────────────────
// La forma del payload
// ─────────────────────────────────────────────────────────────────────────────

export type FactusItemTax = {
  /** "01" (IVA), "04" (INC). */
  code: string;
  /** Porcentaje: "8.00", "19.00". */
  rate: string;
  is_excluded?: boolean;
};

export type FactusItem = {
  code_reference: string;
  name: string;
  quantity: string;
  discount_rate: string;
  /** Precio unitario SIN impuesto ni descuento. */
  price: string;
  unit_measure_code: string;
  standard_code: string;
  taxes: FactusItemTax[];
};

export type FactusPaymentDetail = {
  /** "1" contado, "2" crédito. */
  payment_form: string;
  /** "10" efectivo, "48" débito, "49" crédito, "42" transferencia. */
  payment_method_code: string;
  reference_code: string;
  amount: string;
  due_date?: string;
};

export type FactusCustomer = {
  /** "13" (CC), "31" (NIT), "22" (CE), "41" (pasaporte). */
  identification_document_code: string;
  identification: string;
  dv?: string;
  company?: string;
  trade_name?: string;
  names?: string;
  address: string;
  email?: string;
  phone: string;
  /** "1" jurídica, "2" natural. */
  legal_organization_code: string;
  tribute_code: string;
  country_code: string;
  responsibilities: string[];
  municipality_code: string;
};

/** Los conceptos de corrección de una nota crédito, según la DIAN. */
export const CONCEPTO_NOTA_CREDITO = {
  DEVOLUCION_PARCIAL: "1",
  ANULACION: "2",
  REBAJA: "3",
  AJUSTE_DE_PRECIO: "4",
  OTROS: "5",
} as const;

export type FactusPayload = {
  reference_code: string;
  /** "01" factura electrónica de venta. */
  document: string;
  numbering_range_id?: number;
  operation_type: string;
  send_email?: boolean;
  observation: string;
  payment_details: FactusPaymentDetail[];
  cash_rounding_amount: string;
  customer: FactusCustomer;
  items: FactusItem[];
};

/**
 * La nota crédito NO es una factura con otro `document`: tiene su propio endpoint
 * (`/v2/credit-notes/validate`) y su propio cuerpo.
 *
 * Se descubrió probando contra el sandbox: mandarla a `/v2/bills/validate` con
 * `document: "03"` y `related_documents` devuelve "El campo id rango de
 * numeración es inválido", porque ese endpoint solo acepta rangos de factura de
 * venta. La factura original se referencia por `bill_number`, no por un documento
 * relacionado.
 */
export type FactusNotaCreditoPayload = {
  reference_code: string;
  /** Concepto de corrección DIAN. Ver `CONCEPTO_NOTA_CREDITO`. */
  correction_concept_code: string;
  /** "20" = nota crédito que referencia una factura electrónica. */
  customization_id: string;
  /** El número de la factura que se corrige, tal como lo dio la DIAN. */
  bill_number: string;
  numbering_range_id?: number;
  observation: string;
  payment_details: FactusPaymentDetail[];
  cash_rounding_amount: string;
  customer: FactusCustomer;
  items: FactusItem[];
};

// ─────────────────────────────────────────────────────────────────────────────
// La forma de la entrada, alineada con el schema de Prisma
// ─────────────────────────────────────────────────────────────────────────────

export type RenglonParaFacturar = {
  id: string;
  productId: string;
  nameSnapshot: string;
  quantity: number;
  /** Base gravable del renglón, ya neta de descuento. La calcula `lib/tax.ts`. */
  lineSubtotalCop: number;
  taxRateBpSnapshot: number;
  taxKindSnapshot: TaxKind;
};

export type PedidoParaFacturar = {
  id: string;
  /** El consecutivo visible del día. En Prisma es `Order.code`. */
  code: number;
  notes?: string | null;
  totalCop: number;
  tipCop: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  /** En Prisma es `Order.deliveryAddress`. */
  deliveryAddress?: string | null;
  docType?: string | null;
  docNumber?: string | null;
  items: RenglonParaFacturar[];
  payments: Array<{ id: string; method: string; amountCop: number }>;
};

export type NegocioParaFacturar = {
  name: string;
  address?: string | null;
  phone?: string | null;
};

/** Lo que la DIAN le autorizó a ESE NIT. Vive en `BusinessSettings`. */
export type FiscalDelNegocio = {
  /** El rango de facturas de venta. */
  numberingRangeId: number | null;
  /**
   * El rango de notas crédito, que es OTRA resolución de la DIAN. Se descubrió
   * mirando la cuenta real: "Factura de Venta" y "Nota Crédito" son rangos
   * distintos, así que emitir la nota con el rango de la factura le pone el
   * consecutivo equivocado.
   */
  numberingRangeIdNotaCredito?: number | null;
  municipalityCode: string | null;
};

export type DatosFacturaPlatlia = {
  order: PedidoParaFacturar;
  business: NegocioParaFacturar;
  fiscal: FiscalDelNegocio;
};

export type DatosNotaCreditoPlatlia = DatosFacturaPlatlia & {
  /** El número de la factura que se anula. */
  facturaNumero: string;
  /** Concepto de corrección. Por defecto, anulación de la factura completa. */
  concepto?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapeos de catálogo
// ─────────────────────────────────────────────────────────────────────────────

/** El tipo de documento del cliente al código oficial de la DIAN. */
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
      return "13";
  }
}

/** El medio de pago de Platlia al código oficial de la DIAN. */
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
      // "42" es consignación / transferencia bancaria, que es lo más cercano
      // para las billeteras y para BONO / OTRO.
      return "42";
  }
}

/**
 * El impuesto del renglón al código de la DIAN.
 *
 * Se lee del `kind` CONGELADO en el renglón, no del `TaxRate` vigente: la DIAN
 * separa IVA de impuesto al consumo, y una venta vieja tiene que declararse con
 * la tarifa con la que se cobró.
 */
export function mapearImpuestoDian(taxKind: TaxKind, taxRateBp: number): FactusItemTax[] {
  if (taxRateBp === 0 || taxKind === TaxKind.EXENTO) {
    return [{ code: "01", rate: "0.00" }];
  }
  const rate = (taxRateBp / 100).toFixed(2);
  return taxKind === TaxKind.IMPOCONSUMO ? [{ code: "04", rate }] : [{ code: "01", rate }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Aritmética: centavos enteros de punta a punta
// ─────────────────────────────────────────────────────────────────────────────

function aCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

function comoMonto(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * La propina viaja como un renglón sin impuesto.
 *
 * La otra opción de la especificación es `allowance_charges` con
 * `is_surcharge: true`, pero exige un `concept_type` del catálogo de la DIAN que
 * no está documentado en el material que tenemos, y equivocarlo es una factura
 * rechazada. Un renglón "Propina voluntaria" sin impuesto es lo que hace la
 * mayoría de los POS colombianos y es exacto.
 *
 * Sin esto la propina simplemente no viajaba, y como los pagos SÍ la incluyen, la
 * diferencia contra el total de la factura se iba muy por encima de los ±500 que
 * admite `cash_rounding_amount`: toda venta con propina habría sido rechazada.
 */
const NOMBRE_PROPINA = "Propina voluntaria";

type RenglonCalculado = {
  item: FactusItem;
  /** Lo que Factus va a calcular para este renglón, en centavos. */
  baseCentavos: number;
  impuestoCentavos: number;
};

function calcularRenglon(renglon: RenglonParaFacturar): RenglonCalculado {
  const cantidad = Math.max(1, renglon.quantity);
  // El precio unitario se redondea a centavos, así que `precio × cantidad` puede
  // no dar exactamente la base del renglón. Se calcula la base a partir del
  // precio REDONDEADO —que es lo que va a hacer Factus— y no al revés: si no, el
  // total esperado difiere del emitido por unos centavos y el ajuste de redondeo
  // termina tapando un error nuestro.
  const precioUnitarioCentavos = Math.round(aCentavos(renglon.lineSubtotalCop) / cantidad);
  const baseCentavos = precioUnitarioCentavos * cantidad;
  const impuestoCentavos = Math.round((baseCentavos * renglon.taxRateBpSnapshot) / 10_000);

  return {
    baseCentavos,
    impuestoCentavos,
    item: {
      // El código del producto y no la posición: con `ITEM-001` el mismo plato
      // cambiaba de código en cada factura y no se podía cruzar nada.
      code_reference: renglon.productId,
      name: renglon.nameSnapshot,
      quantity: cantidad.toFixed(2),
      discount_rate: "0.00",
      price: comoMonto(precioUnitarioCentavos),
      unit_measure_code: "94",
      standard_code: "999",
      taxes: mapearImpuestoDian(renglon.taxKindSnapshot, renglon.taxRateBpSnapshot),
    },
  };
}

function renglonDePropina(tipCop: number): RenglonCalculado {
  const baseCentavos = aCentavos(tipCop);
  return {
    baseCentavos,
    impuestoCentavos: 0,
    item: {
      code_reference: "PROPINA",
      name: NOMBRE_PROPINA,
      quantity: "1.00",
      discount_rate: "0.00",
      price: comoMonto(baseCentavos),
      unit_measure_code: "94",
      standard_code: "999",
      taxes: [{ code: "01", rate: "0.00" }],
    },
  };
}

export type TotalesDeFactura = {
  /** Suma de las bases, en centavos. */
  baseCentavos: number;
  impuestoCentavos: number;
  totalCentavos: number;
  pagadoCentavos: number;
  /** `pagado − total`. Es lo que la especificación llama ajuste de redondeo. */
  ajusteCentavos: number;
};

/** Cuánto admite Factus de diferencia entre los pagos y el total. */
export const AJUSTE_MAXIMO_CENTAVOS = 50_000; // ±500.00

/**
 * Los totales que Factus va a calcular con lo que le mandamos.
 *
 * Existe para poder afirmar, con un test y sin salir a la red, que la factura va
 * a cuadrar con la tirilla.
 */
export function totalesDeFactura(datos: DatosFacturaPlatlia): TotalesDeFactura {
  const renglones = calcularRenglones(datos.order);
  const baseCentavos = renglones.reduce((s, r) => s + r.baseCentavos, 0);
  const impuestoCentavos = renglones.reduce((s, r) => s + r.impuestoCentavos, 0);
  const totalCentavos = baseCentavos + impuestoCentavos;
  const pagadoCentavos = pagosEnCentavos(datos.order);

  return {
    baseCentavos,
    impuestoCentavos,
    totalCentavos,
    pagadoCentavos,
    ajusteCentavos: pagadoCentavos - totalCentavos,
  };
}

function calcularRenglones(order: PedidoParaFacturar): RenglonCalculado[] {
  const renglones = order.items.map(calcularRenglon);
  if (order.tipCop > 0) renglones.push(renglonDePropina(order.tipCop));
  return renglones;
}

function pagosEnCentavos(order: PedidoParaFacturar): number {
  if (order.payments.length === 0) return aCentavos(order.totalCop);
  return order.payments.reduce((s, p) => s + aCentavos(p.amountCop), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// El payload
// ─────────────────────────────────────────────────────────────────────────────

/** Máximo que admite `observation` según la especificación. */
const MAXIMO_OBSERVACION = 250;

/**
 * El código con el que Factus previene duplicados.
 *
 * Se deriva SOLO del id del pedido. Antes llevaba `new Date().getFullYear()`, así
 * que dos reintentos a caballo del año nuevo eran dos documentos distintos para
 * la misma venta, que es exactamente lo que este campo existe para evitar.
 */
export function referenciaDeFactura(orderId: string, documento = "01"): string {
  const prefijo = documento === "03" ? "NC" : "FV";
  return `${prefijo}-${orderId}`;
}

/**
 * Las partes que comparten la factura y la nota crédito: cliente, renglones,
 * pagos, observación y ajuste de redondeo.
 */
function nucleoDelDocumento(datos: DatosFacturaPlatlia) {
  const { order, business, fiscal } = datos;

  // ── Cliente ──────────────────────────────────────────────────────────────
  const aConsumidorFinal = esConsumidorFinal({ docNumber: order.docNumber });
  const docCode = aConsumidorFinal
    ? CONSUMIDOR_FINAL.codigoDocumento
    : mapearDocumentoDian(order.docType);
  const docNum = aConsumidorFinal ? CONSUMIDOR_FINAL.documento : order.docNumber!.trim();
  // `customerName` es la etiqueta de la cuenta ("Andrés", "Cuenta 2"), no un
  // nombre fiscal: solo se usa cuando de verdad hay un documento al cual atarlo.
  const nombreCliente = aConsumidorFinal
    ? CONSUMIDOR_FINAL.nombre
    : order.customerName?.trim() || "Cliente General";

  const esJuridica = docCode === "31";
  const correoCliente = order.customerEmail?.trim();

  const customer: FactusCustomer = {
    identification_document_code: docCode,
    identification: docNum,
    legal_organization_code: esJuridica ? "1" : "2",
    ...(esJuridica
      ? { company: nombreCliente, trade_name: nombreCliente }
      : { names: nombreCliente }),
    address: order.deliveryAddress?.trim() || business.address?.trim() || "Colombia",
    // Sin correo no se manda la clave: la especificación advierte que un campo
    // opcional con dato adentro pasa a ser obligatorio, y una cadena vacía es
    // dato. Antes caía a una casilla de Platlia, que además mandaba a Platlia las
    // facturas de los clientes de todos los negocios.
    ...(correoCliente ? { email: correoCliente } : {}),
    phone: order.customerPhone?.trim() || business.phone?.trim() || "3000000000",
    tribute_code: "ZZ",
    country_code: "CO",
    responsibilities: ["R-99-PN"],
    municipality_code: fiscal.municipalityCode || "05001",
  };

  // ── Renglones y totales ──────────────────────────────────────────────────
  const renglones = calcularRenglones(order);
  const totales = totalesDeFactura(datos);

  // ── Pagos ────────────────────────────────────────────────────────────────
  const paymentDetails: FactusPaymentDetail[] = order.payments.map((p) => ({
    payment_form: "1",
    payment_method_code: mapearMedioPagoDian(p.method),
    reference_code: `PAGO-${p.id.slice(-6)}`,
    amount: comoMonto(aCentavos(p.amountCop)),
  }));

  if (paymentDetails.length === 0) {
    paymentDetails.push({
      payment_form: "1",
      payment_method_code: "10",
      reference_code: `PAGO-${order.id.slice(-6)}`,
      amount: comoMonto(aCentavos(order.totalCop)),
    });
  }

  return {
    customer,
    correoCliente,
    items: renglones.map((r) => r.item),
    paymentDetails,
    // El ajuste de redondeo NO es el paso de redondeo del efectivo: la
    // especificación lo define como la diferencia entre lo que suman los pagos y
    // el total de la factura. Antes se mandaba `settings.cashRoundingCop` (50)
    // siempre, hubiera diferencia o no.
    cashRounding: comoMonto(totales.ajusteCentavos),
  };
}

function observacionDe(order: PedidoParaFacturar, porDefecto: string): string {
  return (order.notes?.trim() || porDefecto).slice(0, MAXIMO_OBSERVACION);
}

export function construirPayloadFactus(datos: DatosFacturaPlatlia): FactusPayload {
  const { order, fiscal } = datos;
  const nucleo = nucleoDelDocumento(datos);

  return {
    reference_code: referenciaDeFactura(order.id),
    document: "01",
    ...(fiscal.numberingRangeId ? { numbering_range_id: fiscal.numberingRangeId } : {}),
    operation_type: "10",
    // Solo cuando hay a quién mandársela. Antes iba siempre en `true` con el
    // correo cayendo a una casilla de Platlia: eso mandaba a Platlia las facturas
    // de los clientes de todos los negocios.
    send_email: Boolean(nucleo.correoCliente),
    observation: observacionDe(order, `Pedido #${order.code} · Platlia`),
    payment_details: nucleo.paymentDetails,
    cash_rounding_amount: nucleo.cashRounding,
    customer: nucleo.customer,
    items: nucleo.items,
  };
}

/**
 * La nota crédito que anula una factura.
 *
 * Otro endpoint y otro cuerpo que la factura: referencia la original por
 * `bill_number` —no con `related_documents`— y usa el rango de numeración de
 * notas crédito, que en la cuenta de Factus es una resolución distinta.
 */
export function construirPayloadNotaCredito(
  datos: DatosNotaCreditoPlatlia,
): FactusNotaCreditoPayload {
  const { order, fiscal } = datos;
  const nucleo = nucleoDelDocumento(datos);

  return {
    reference_code: referenciaDeFactura(order.id, "03"),
    correction_concept_code: datos.concepto ?? CONCEPTO_NOTA_CREDITO.ANULACION,
    // "20": nota crédito que referencia una factura electrónica. La alternativa
    // es la nota sin referencia, que no es este caso.
    customization_id: "20",
    bill_number: datos.facturaNumero,
    ...(fiscal.numberingRangeIdNotaCredito
      ? { numbering_range_id: fiscal.numberingRangeIdNotaCredito }
      : {}),
    observation: observacionDe(order, `Anulación del pedido #${order.code}`),
    payment_details: nucleo.paymentDetails,
    cash_rounding_amount: nucleo.cashRounding,
    customer: nucleo.customer,
    items: nucleo.items,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// El cliente HTTP
// ─────────────────────────────────────────────────────────────────────────────

export type ConfigFactus = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  baseUrl: string;
};

/**
 * Las credenciales viven en `lib/billing/factus-plataforma.ts`, que es el único
 * archivo de esta pareja que lee el entorno: este módulo se mantiene puro para
 * que el mapeador —donde estaban los errores caros— pueda tener tests.
 */

export type RespuestaTokenFactus = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

/** Autenticación OAuth2 contra Factus. */
export async function obtenerTokenFactus(config: ConfigFactus): Promise<RespuestaTokenFactus> {
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password: config.password,
  });

  const response = await fetch(`${config.baseUrl}/oauth/token`, {
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

  return (await response.json()) as RespuestaTokenFactus;
}

export type RangoDeNumeracion = {
  id: number;
  /** "Factura de Venta", "Nota Crédito", "Nota Débito"… */
  document: string;
  prefix: string | null;
  from: number | null;
  to: number | null;
  current: number | null;
  resolution_number?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  is_expired?: boolean;
};

/** Si el rango sirve para emitir facturas de venta. */
export function esRangoDeFactura(rango: RangoDeNumeracion): boolean {
  return /factura/i.test(rango.document);
}

/** Si el rango sirve para emitir notas crédito. */
export function esRangoDeNotaCredito(rango: RangoDeNumeracion): boolean {
  return /nota\s*cr/i.test(rango.document);
}

/**
 * Los rangos de numeración autorizados por la DIAN.
 *
 * Existe para que el rango se ELIJA de una lista en vez de escribirse a mano: es
 * un id que nadie se sabe de memoria, y un dígito equivocado es una factura
 * rechazada por la DIAN que aparece recién al emitir.
 */
export async function listarRangosDeNumeracion(
  token: string,
  baseUrl: string,
): Promise<RangoDeNumeracion[]> {
  const response = await fetch(`${baseUrl}/v2/numbering-ranges`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error consultando rangos de numeración (${response.status}): ${errorBody}`);
  }

  // La respuesta viene envuelta dos veces: `{ data: { data: [...], pagination } }`.
  // Leer solo el primer `data` devolvía siempre una lista vacía, y una lista vacía
  // se parece demasiado a "la cuenta no tiene rangos" como para notarlo.
  const cuerpo = (await response.json()) as { data?: unknown };
  const nivel1 = cuerpo.data;
  if (Array.isArray(nivel1)) return nivel1 as RangoDeNumeracion[];
  if (nivel1 && typeof nivel1 === "object" && Array.isArray((nivel1 as { data?: unknown }).data)) {
    return (nivel1 as { data: RangoDeNumeracion[] }).data;
  }
  return [];
}

export type RespuestaFactusValidacion = {
  status?: string;
  message?: string;
  data?: {
    reference_code?: string;
    number?: string;
    is_validated?: boolean;
    validated_at?: string;
    /** La factura trae CUFE. */
    cufe?: string;
    /**
     * La nota crédito trae CUDE, no CUFE.
     *
     * Leer solo `cufe` hacía que una nota crédito emitida CON ÉXITO se guardara
     * como error: el documento existía ante la DIAN y el sistema no se enteraba,
     * que es el peor estado posible.
     */
    cude?: string;
    links?: { qr?: string; public_url?: string };
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

/** El identificador del documento ante la DIAN: CUFE en factura, CUDE en nota. */
export function identificadorDian(datos: RespuestaFactusValidacion["data"]): string | null {
  return datos?.cude ?? datos?.cufe ?? null;
}

/** Valida y emite el documento en la API v2 de Factus. */
export async function enviarFacturaAFactus(
  token: string,
  payload: FactusPayload,
  baseUrl: string,
): Promise<RespuestaFactusValidacion> {
  const response = await fetch(`${baseUrl}/v2/bills/validate`, {
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
 * Valida y emite la nota crédito.
 *
 * Endpoint propio: `/v2/bills/validate` no la acepta, contesta que el rango de
 * numeración es inválido porque ahí solo entran rangos de factura de venta.
 */
export async function enviarNotaCreditoAFactus(
  token: string,
  payload: FactusNotaCreditoPayload,
  baseUrl: string,
): Promise<RespuestaFactusValidacion> {
  const response = await fetch(`${baseUrl}/v2/credit-notes/validate`, {
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
    throw new Error(`Error enviando nota crédito a Factus (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as RespuestaFactusValidacion;
}

export type TipoDeDocumentoFactus = "bills" | "credit-notes";

/**
 * Busca un documento por el código de referencia que le pusimos nosotros.
 *
 * Es la red para el peor caso: la emisión sale bien en Factus pero la respuesta
 * se pierde —se corta la red, se cae el proceso, se lee mal el cuerpo— y queda un
 * documento vivo ante la DIAN que el sistema no registró. Como el
 * `reference_code` es determinista, se puede ir a buscar y recuperar en vez de
 * intentar emitir otra vez.
 */
export async function buscarDocumentoPorReferencia(
  token: string,
  baseUrl: string,
  tipo: TipoDeDocumentoFactus,
  referencia: string,
): Promise<RespuestaFactusValidacion["data"] | null> {
  const url = `${baseUrl}/v2/${tipo}?filter[reference_code]=${encodeURIComponent(referencia)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!response.ok) return null;

  const cuerpo = (await response.json()) as { data?: unknown };
  const nivel1 = cuerpo.data;
  const lista = Array.isArray(nivel1)
    ? nivel1
    : nivel1 && typeof nivel1 === "object" && Array.isArray((nivel1 as { data?: unknown }).data)
      ? (nivel1 as { data: unknown[] }).data
      : [];

  return (lista[0] as RespuestaFactusValidacion["data"]) ?? null;
}

/** El enlace de descarga del PDF de un documento ya emitido. */
export async function descargarPdfFactura(token: string, billNumber: string, baseUrl: string) {
  const response = await fetch(
    `${baseUrl}/v2/bills/${encodeURIComponent(billNumber)}/download-pdf`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error descargando PDF de Factus (${response.status}): ${errorBody}`);
  }

  return await response.json();
}
