import { notFound } from "next/navigation";
import { getPedidoParaTiquete } from "@/features/pedidos/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { formatCop, formatRateBp } from "@/lib/money";
import {
  anchoEnCaracteres,
  centrar,
  envolver,
  lineaDeProducto,
  lineaDoble,
  separador,
} from "@/lib/printing/ticket";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { formatTurno } from "@/lib/turns";
import { BotonImprimir, ImprimirAlAbrir } from "../../imprimir-al-abrir";

export const dynamic = "force-dynamic";

const METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "T. débito",
  TARJETA_CREDITO: "T. crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
  BONO: "Bono",
  OTRO: "Otro",
};

export default async function TiquetePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const [{ id }, { auto }] = await Promise.all([params, searchParams]);
  // `?auto=0` muestra el tiquete sin mandarlo a la impresora: sirve para
  // revisarlo antes de gastar papel, y para que las pruebas no queden colgadas
  // esperando el cuadro de impresión del navegador.
  const imprimirSolo = auto !== "0";

  // Verifica por su cuenta, como toda página. No exige licencia vigente a
  // propósito: reimprimir un tiquete viejo tiene que funcionar aunque la
  // suscripción se haya vencido.
  const ctx = await requireBusiness();

  const pedido = await getPedidoParaTiquete(ctx.business.id, id);
  if (!pedido) notFound();

  const negocio = pedido.business;
  const settings = negocio.settings;
  const ancho = anchoEnCaracteres(settings?.receiptWidth ?? "MM80");
  const milimetros = (settings?.receiptWidth ?? "MM80") === "MM55" ? 55 : 80;
  const zona = settings?.timeZone ?? "America/Bogota";

  const lineas: string[] = [];
  const push = (...ls: string[]) => lineas.push(...ls);

  // ── Encabezado ────────────────────────────────────────────────────────────
  push(centrar((negocio.legalName ?? negocio.name).toUpperCase(), ancho));
  if (negocio.taxId) push(centrar(`NIT ${negocio.taxId}`, ancho));
  if (negocio.address) push(...envolver(negocio.address, ancho).map((l) => centrar(l, ancho)));
  if (negocio.phone) push(centrar(negocio.phone, ancho));
  if (settings?.receiptHeader) {
    push(...envolver(settings.receiptHeader, ancho).map((l) => centrar(l, ancho)));
  }
  push(separador(ancho));

  // ── Identificación del pedido ─────────────────────────────────────────────
  const momento = pedido.closedAt ?? pedido.openedAt;
  push(lineaDoble(`Pedido ${pedido.code}`, formatDateTimeInTimeZone(momento, zona), ancho));
  if (pedido.turnNumber !== null) {
    const turnoFmt = formatTurno(
      pedido.turnNumber,
      settings?.turnNumberMax ?? 99,
      pedido.type === "MESA",
    );
    push(centrar(`*** TURNO ${turnoFmt} ***`, ancho));
  }
  if (pedido.table) push(`Mesa ${pedido.table.name}`);
  if (pedido.customerName) push(...envolver(`Cliente: ${pedido.customerName}`, ancho));
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

  // ── Pie ───────────────────────────────────────────────────────────────────
  push("");
  if (settings?.receiptFooter) {
    push(...envolver(settings.receiptFooter, ancho).map((l) => centrar(l, ancho)));
  }
  if (pedido.status !== "PAGADA") {
    push(centrar("*** CUENTA DE COBRO ***", ancho));
    push(centrar("no es factura de venta", ancho));
  }
  push("");
  push(centrar("Platlia", ancho));

  return (
    <>
      {/* El tamaño de página depende del rollo configurado: 55 y 80 mm no son el
          mismo documento, así que el CSS se arma acá y no en una hoja global. */}
      <style>{`
        @page { size: ${milimetros}mm auto; margin: 3mm; }
        @media print { .no-imprimir { display: none !important; } }
        .tiquete {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 9.5px;
          line-height: 1.4;
          white-space: pre;
          color: #000;
          margin: 0 auto;
          width: ${ancho}ch;
        }
      `}</style>

      {imprimirSolo && <ImprimirAlAbrir />}
      <pre className="tiquete">{lineas.join("\n")}</pre>
      <BotonImprimir />
    </>
  );
}
