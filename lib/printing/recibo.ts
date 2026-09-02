/**
 * El recibo del cliente, en líneas de ancho fijo.
 *
 * Vivía dentro de `app/imprimir/pedido/[id]/page.tsx`, que era el único lugar que
 * lo necesitaba mientras imprimir significaba abrir una pestaña. Ahora la cola de
 * impresión térmica compone el mismo papel sin navegador de por medio, y las dos
 * tienen que salir idénticas: si no, reimprimir desde la pantalla daría un tiquete
 * distinto del que salió por la impresora de la caja.
 *
 * Módulo puro —solo depende de otros módulos puros— y por eso tiene tests.
 */

import { formatCop, formatRateBp } from "@/lib/money";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { formatTurno } from "@/lib/turns";
import { centrar, envolver, lineaDeProducto, lineaDoble, separador } from "@/lib/printing/ticket";

const METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "T. débito",
  TARJETA_CREDITO: "T. crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
  BONO: "Bono",
  OTRO: "Otro",
  CREDITO: "Crédito (fiado)",
};

/**
 * La forma que necesita el recibo, descrita a mano.
 *
 * No se deriva del tipo de la consulta a propósito: eso ataría este módulo a
 * Prisma y lo sacaría de los tests, que corren en jsdom.
 */
export type PedidoDeRecibo = {
  code: number;
  type: string;
  status: string;
  turnNumber: number | null;
  openedAt: Date;
  closedAt: Date | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  docType: string | null;
  docNumber: string | null;
  guestsCount: number | null;
  subtotalCop: number;
  discountCop: number;
  deliveryFeeCop: number;
  tipCop: number;
  totalCop: number;
  paidCop: number;
  facturaElectronicaNumero: string | null;
  facturaElectronicaCufe: string | null;
  notaCreditoNumero: string | null;
  table: { name: string } | null;
  openedBy: { name: string };
  items: {
    quantity: number;
    nameSnapshot: string;
    unitPriceCop: number;
    lineSubtotalCop: number;
    lineTaxCop: number;
    lineTotalCop: number;
    notes: string | null;
    taxRateNameSnapshot: string;
    taxRateBpSnapshot: number;
    modifiers: { optionNameSnapshot: string; priceDeltaCopSnapshot: number }[];
  }[];
  payments: {
    method: string;
    amountCop: number;
    tenderedCop: number | null;
    changeCop: number | null;
  }[];
  /**
   * El fiado, cuando lo hay. Viaja aparte y no se deduce de `paidCop`.
   *
   * Un pago de método CRÉDITO deja `paidCop == totalCop`, así que el bloque
   * "PENDIENTE" —que se dispara con el faltante— **no se imprime**, y el status es
   * `PAGADA`, así que tampoco sale el sello de "cuenta de cobro". Sin esto, el
   * papel que se lleva quien acaba de fiar dice "Crédito $50.000" y se lee
   * idéntico a una tarjeta: el único comprobante de la deuda del lado del cliente
   * afirmaría que no debe nada.
   */
  fiado: {
    saldoCop: number;
    deudor: { nombre: string; telefono: string };
  } | null;
};

export type NegocioDeRecibo = {
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
};

export type OpcionesDeRecibo = {
  ancho: number;
  zona: string;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  turnNumberMax?: number;
};

export function componerRecibo(
  pedido: PedidoDeRecibo,
  negocio: NegocioDeRecibo,
  opciones: OpcionesDeRecibo,
): string[] {
  const { ancho, zona, receiptHeader, receiptFooter, turnNumberMax = 99 } = opciones;

  const lineas: string[] = [];
  const push = (...ls: string[]) => lineas.push(...ls);

  // ── Encabezado ────────────────────────────────────────────────────────────
  push(centrar((negocio.legalName ?? negocio.name).toUpperCase(), ancho));
  if (negocio.taxId) push(centrar(`NIT ${negocio.taxId}`, ancho));
  if (negocio.address) push(...envolver(negocio.address, ancho).map((l) => centrar(l, ancho)));
  if (negocio.phone) push(centrar(negocio.phone, ancho));
  if (receiptHeader) {
    push(...envolver(receiptHeader, ancho).map((l) => centrar(l, ancho)));
  }
  push(separador(ancho));

  // ── Identificación del pedido ─────────────────────────────────────────────
  const momento = pedido.closedAt ?? pedido.openedAt;
  push(lineaDoble(`Pedido ${pedido.code}`, formatDateTimeInTimeZone(momento, zona), ancho));
  if (pedido.turnNumber !== null) {
    const turnoFmt = formatTurno(pedido.turnNumber, turnNumberMax, pedido.type === "MESA");
    push(centrar(`*** TURNO ${turnoFmt} ***`, ancho));
  }
  if (pedido.table) push(`Mesa ${pedido.table.name}`);
  // En una mesa con cuentas separadas, esto es lo único que dice a quién se le
  // está cobrando: sin el nombre, tres tiquetes de la mesa 12 son idénticos y no
  // hay forma de entregarle el suyo a cada uno.
  if (pedido.customerName) {
    push(...envolver(`${pedido.table ? "Cuenta" : "Cliente"}: ${pedido.customerName}`, ancho));
  }
  // Los datos fiscales solo aparecen cuando de verdad hay a quién facturar. Sin
  // documento la venta va a consumidor final y no hay nada que imprimir.
  if (pedido.docNumber) {
    push(`${pedido.docType ?? "CC"} ${pedido.docNumber}`);
    if (pedido.customerEmail) push(...envolver(pedido.customerEmail, ancho));
  }
  if (pedido.type === "DOMICILIO") {
    push(centrar("*** PEDIDO A DOMICILIO ***", ancho));
    if (pedido.customerPhone) push(`Tel: ${pedido.customerPhone}`);
    if (pedido.deliveryAddress) push(...envolver(`Dir: ${pedido.deliveryAddress}`, ancho));
  }
  push(`Atendio: ${pedido.openedBy.name}`);
  if (pedido.guestsCount) push(`Personas: ${pedido.guestsCount}`);
  push(separador(ancho));

  // ── Renglones ─────────────────────────────────────────────────────────────
  for (const item of pedido.items) {
    push(...lineaDeProducto(item.quantity, item.nameSnapshot, formatCop(item.lineTotalCop), ancho));

    // Los modificadores van indentados bajo el renglón, con su recargo cuando lo
    // tienen. El total del renglón no cambia: el recargo ya está dentro de
    // `unitPriceCop`, así que esto es el desglose de un número que ya está bien.
    for (const mod of item.modifiers) {
      const etiqueta =
        mod.priceDeltaCopSnapshot > 0
          ? `+ ${mod.optionNameSnapshot} (${formatCop(mod.priceDeltaCopSnapshot)})`
          : `+ ${mod.optionNameSnapshot}`;
      push(...envolver(etiqueta, ancho - 2).map((l) => `  ${l}`));
    }

    if (item.quantity > 1) {
      push(`  ${formatCop(item.unitPriceCop)} c/u`);
    }
    if (item.notes) push(...envolver(item.notes, ancho - 2).map((l) => `  ${l}`));
  }
  push(separador(ancho));

  // ── Impuestos, agrupados por tarifa ───────────────────────────────────────
  // Se agrupa por la tarifa CONGELADA en cada renglón: un pedido puede tener
  // productos con impuesto al consumo y otros exentos, y la DIAN los quiere
  // separados.
  const porTarifa = new Map<string, { nombre: string; bp: number; base: number; impuesto: number }>();
  for (const item of pedido.items) {
    const clave = `${item.taxRateNameSnapshot}|${item.taxRateBpSnapshot}`;
    const actual = porTarifa.get(clave) ?? {
      nombre: item.taxRateNameSnapshot,
      bp: item.taxRateBpSnapshot,
      base: 0,
      impuesto: 0,
    };
    actual.base += item.lineSubtotalCop;
    actual.impuesto += item.lineTaxCop;
    porTarifa.set(clave, actual);
  }

  push(lineaDoble("Base gravable", formatCop(pedido.subtotalCop), ancho));
  for (const tarifa of porTarifa.values()) {
    if (tarifa.impuesto === 0 && tarifa.bp === 0) continue;
    push(
      lineaDoble(`${tarifa.nombre} ${formatRateBp(tarifa.bp)}`, formatCop(tarifa.impuesto), ancho),
    );
  }
  if (pedido.discountCop > 0) {
    push(lineaDoble("Descuento", `-${formatCop(pedido.discountCop)}`, ancho));
  }
  if (pedido.deliveryFeeCop > 0) {
    push(lineaDoble("Domicilio", formatCop(pedido.deliveryFeeCop), ancho));
  }
  if (pedido.tipCop > 0) push(lineaDoble("Propina", formatCop(pedido.tipCop), ancho));
  push(separador(ancho, "="));
  push(lineaDoble("TOTAL", formatCop(pedido.totalCop), ancho));
  push(separador(ancho, "="));

  // ── Pagos ─────────────────────────────────────────────────────────────────
  for (const pago of pedido.payments) {
    push(lineaDoble(METODO[pago.method] ?? pago.method, formatCop(pago.amountCop), ancho));
    if (pago.tenderedCop !== null) {
      push(lineaDoble("  Recibido", formatCop(pago.tenderedCop), ancho));
    }
    if (pago.changeCop !== null && pago.changeCop > 0) {
      push(lineaDoble("  Vuelto", formatCop(pago.changeCop), ancho));
    }
  }

  const faltante = pedido.totalCop - pedido.paidCop;
  if (faltante > 0) {
    push(separador(ancho));
    push(lineaDoble("PENDIENTE", formatCop(faltante), ancho));
  }

  // El comprobante del fiado. Va con nombre y teléfono porque es lo que después
  // se compara contra la ficha de Cartera cuando el cliente vuelve a pagar.
  if (pedido.fiado) {
    push(separador(ancho, "="));
    push(centrar("*** FIADO ***", ancho));
    push(lineaDoble("QUEDA DEBIENDO", formatCop(pedido.fiado.saldoCop), ancho));
    push(pedido.fiado.deudor.nombre);
    push(pedido.fiado.deudor.telefono);
    push(centrar("Comprobante de fiado", ancho));
    push(centrar("no es factura de venta", ancho));
    push(separador(ancho, "="));
  }

  // ── Factura electrónica ───────────────────────────────────────────────────
  // Solo cuando de verdad se emitió. Sin esto, la tirilla reimpresa de una venta
  // facturada no decía en ninguna parte que hubiera factura, que es medio punto
  // de haberla emitido.
  if (pedido.facturaElectronicaCufe) {
    push(separador(ancho));
    push(centrar("FACTURA ELECTRONICA DE VENTA", ancho));
    if (pedido.facturaElectronicaNumero) {
      push(centrar(`No. ${pedido.facturaElectronicaNumero}`, ancho));
    }
    push("CUFE:");
    // El CUFE es una tira de 96 caracteres: se parte al ancho del rollo, que es
    // lo único que lo deja legible en 32 o 48 columnas.
    push(...envolver(pedido.facturaElectronicaCufe, ancho));
    if (pedido.notaCreditoNumero) {
      push(separador(ancho));
      push(centrar("*** ANULADA CON NOTA CREDITO ***", ancho));
      push(centrar(pedido.notaCreditoNumero, ancho));
    }
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  push("");
  if (receiptFooter) {
    push(...envolver(receiptFooter, ancho).map((l) => centrar(l, ancho)));
  }
  if (pedido.status !== "PAGADA") {
    push(centrar("*** CUENTA DE COBRO ***", ancho));
    push(centrar("no es factura de venta", ancho));
  }
  push("");
  push(centrar("Platlia", ancho));

  /**
   * Todo en mayúsculas, al final y de una sola pasada — igual que la comanda.
   *
   * Va acá y no en el CSS de `app/imprimir/pedido/[id]` porque de este módulo
   * salen LOS DOS papeles: el que imprime el navegador y el que arma la cola
   * térmica. Con la caja alta puesta solo en la pantalla, el mismo pedido salía
   * en mayúsculas por un camino y en texto mixto por el otro, y reimprimir daba
   * un tiquete distinto del que había salido por la caja: exactamente lo que
   * este módulo existe para evitar.
   *
   * Después de componer y no en cada `push`, para que `centrar`, `envolver` y
   * `lineaDoble` hayan medido sobre el texto real. En español la caja alta no
   * cambia el largo, así que ninguna columna se mueve; CP858 tiene Á É Í Ó Ú Ñ y
   * `escpos.ts` las mapea.
   */
  return lineas.map((linea) => linea.toUpperCase());
}
