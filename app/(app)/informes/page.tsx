import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import {
  getAlertasInventario,
  getAnulaciones,
  getPorMetodoDePago,
  getPorTarifa,
  getProductosMasVendidos,
  getResumenDeJornada,
} from "@/features/informes/queries";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/dal";
import { formatCop, formatRateBp, promedioCop, variacionPorcentual } from "@/lib/money";
import { currentBusinessDate, formatBusinessDate, parseBusinessDate } from "@/lib/time";
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, ShoppingBag } from "lucide-react";

export const metadata: Metadata = { title: "Informes & Ventas · Platlia" };
export const dynamic = "force-dynamic";

const METODO: Record<string, string> = {
  EFECTIVO: "Efectivo en caja",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia bancaria",
  BONO: "Bono / Vale",
  OTRO: "Otro medio de pago",
};

const DIA_MS = 86_400_000;

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ jornada?: string }>;
}) {
  const ctx = await requireModule(AppModule.INFORMES);
  const { jornada } = await searchParams;
  const settings = await getSettings(ctx.business.id);

  let dia: Date;
  try {
    dia = jornada ? parseBusinessDate(jornada) : currentBusinessDate(settings);
  } catch {
    dia = currentBusinessDate(settings);
  }

  const anterior = new Date(dia.getTime() - DIA_MS);
  const hoy = currentBusinessDate(settings);

  const [resumen, resumenAnterior, porMetodo, porTarifa, top, anulaciones, alertasStock] = await Promise.all([
    getResumenDeJornada(ctx.business.id, dia),
    getResumenDeJornada(ctx.business.id, anterior),
    getPorMetodoDePago(ctx.business.id, dia),
    getPorTarifa(ctx.business.id, dia),
    getProductosMasVendidos(ctx.business.id, dia),
    getAnulaciones(ctx.business.id, dia),
    getAlertasInventario(ctx.business.id),
  ]);

  const variacion = variacionPorcentual(resumen.ventasCop, resumenAnterior.ventasCop);
  const ticket = promedioCop(resumen.ventasCop, resumen.pedidos);
  const esHoy = dia.getTime() === hoy.getTime();

  return (
    <div className="space-y-8 max-w-7xl">
      {/* ─── Header Informes Dark Kitchen-Fire ─── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-foreground leading-[0.95]">
            Informes & Ventas
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 font-sans">
            Jornada del <span className="font-mono font-bold text-foreground">{formatBusinessDate(dia)}</span>
            {esHoy && <span className="text-brand font-semibold ml-2">● En curso (Corte 5:00 a.m.)</span>}
          </p>
        </div>

        <nav className="flex items-center gap-2">
          <Link
            href={`/informes?jornada=${formatBusinessDate(anterior)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Día anterior
          </Link>
          {!esHoy && (
            <Link
              href="/informes"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/50 bg-brand/10 text-xs font-mono text-brand font-bold hover:bg-brand/20 transition-colors"
            >
              Ver hoy <ArrowRight className="size-3.5" />
            </Link>
          )}
        </nav>
      </div>

      {/* ─── KPIs Gastronómicos Principales ─── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="VENTAS FACTURADAS"
          valor={formatCop(resumen.ventasCop)}
          detalle={
            variacion === null
              ? "Sin ventas registradas el día anterior"
              : `${variacion >= 0 ? "+" : ""}${variacion}% vs. día anterior`
          }
          isPositive={variacion !== null && variacion >= 0}
        />
        <Indicador
          titulo="TOTAL COMANDAS"
          valor={`${resumen.pedidos} pedidos`}
          detalle="Comandas de salón, mostrador y domicilios"
        />
        <Indicador
          titulo="TICKET PROMEDIO"
          valor={formatCop(ticket)}
          detalle="Gasto promedio por orden cerrada"
        />
        <Indicador
          titulo="PROPINAS SUGERIDAS"
          valor={formatCop(resumen.propinasCop)}
          detalle="10% voluntario recaudado para el equipo"
        />
      </div>

      {/* ─── Medios de Pago & Impuestos ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Medios de Pago
              </h2>
              <span className="font-mono text-[10px] text-muted-foreground">RECAUDO</span>
            </div>

            {porMetodo.length === 0 ? (
              <Vacio />
            ) : (
              <ul className="divide-border/60 divide-y divide-dashed text-sm">
                {porMetodo.map((m) => (
                  <li key={m.method} className="flex justify-between items-center py-2.5 first:pt-0">
                    <div>
                      <span className="font-medium text-foreground">{METODO[m.method] ?? m.method}</span>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        ({m.cantidad} {m.cantidad === 1 ? "cobro" : "cobros"})
                      </span>
                    </div>
                    <span className="numeral font-mono font-bold text-foreground text-sm">
                      {formatCop(m.totalCop)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Impuestos & Tarifas
              </h2>
              <span className="font-mono text-[10px] text-muted-foreground">IMPOCONSUMO (ICO) / IVA</span>
            </div>

            {porTarifa.length === 0 ? (
              <Vacio />
            ) : (
              <ul className="divide-border/60 divide-y divide-dashed text-sm">
                {porTarifa.map((t) => (
                  <li key={`${t.nombre}-${t.rateBp}`} className="space-y-1 py-2.5 first:pt-0">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-foreground">
                        {t.nombre}{" "}
                        <span className="text-brand font-mono text-xs font-bold ml-1">
                          ({formatRateBp(t.rateBp)})
                        </span>
                      </span>
                      <span className="numeral font-mono font-bold text-foreground">
                        {formatCop(t.impuestoCop)}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex justify-between font-mono text-xs">
                      <span>Base gravable neta:</span>
                      <span className="numeral">{formatCop(t.baseCop)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Lo Más Vendido ─── */}
      <Card className="border-border/80 bg-card">
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
              Ranking de Platos y Bebidas Más Vendidos
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">TOP DE LA JORNADA</span>
          </div>

          {top.length === 0 ? (
            <Vacio />
          ) : (
            <ul className="divide-border/60 divide-y divide-dashed text-sm">
              {top.map((p, idx) => (
                <li key={p.nombre} className="flex justify-between items-center py-2.5 first:pt-0">
                  <div className="flex items-center gap-3">
                    <span className="size-6 rounded-full bg-muted/60 text-muted-foreground font-mono text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-foreground">{p.nombre}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      ({p.unidades} {p.unidades === 1 ? "unidad" : "unidades"})
                    </span>
                  </div>
                  <span className="numeral font-mono font-bold text-foreground">
                    {formatCop(p.totalCop)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─── Anulaciones ─── */}
      {(anulaciones.renglones.length > 0 || anulaciones.pedidosAnulados > 0) && (
        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Auditoría de Anulaciones
              </h2>
              <span className="font-mono text-[10px] text-brand font-bold">SEGURIDAD FISCAL</span>
            </div>

            <ul className="divide-border/60 divide-y divide-dashed text-sm">
              {anulaciones.renglones.map((r) => (
                <li key={r.id} className="space-y-1 py-2.5 first:pt-0">
                  <div className="flex justify-between items-center">
                    <span className="text-foreground">
                      <span className="numeral font-bold text-brand mr-2">{r.quantity}x</span>
                      {r.nameSnapshot}
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        (Pedido #{r.order.code})
                      </span>
                    </span>
                    <span className="numeral font-mono font-bold text-foreground">
                      {formatCop(r.lineTotalCop)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs font-mono">
                    Motivo: {r.canceledReason}
                    {r.canceledBy && ` · Anulado por ${r.canceledBy.name}`}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ─── Alertas de Inventario & Abastecimiento (Dos Inventarios) ─── */}
      <Card className="border-border/80 bg-card overflow-hidden">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Alertas de Inventario & Abastecimiento
              </h2>
            </div>
            <Link
              href="/inventario"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/40 bg-brand/10 text-xs font-mono text-brand font-bold hover:bg-brand/20 transition-colors"
            >
              <Boxes className="size-3.5" /> Ir a Cargar Compras / Ajustar Inventario <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {alertasStock.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground font-mono bg-emerald-500/5 rounded-xl border border-emerald-500/20">
              🟢 Todos los inventarios (Productos Terminados e Insumos de Receta) cuentan con stock saludable.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Columna Insumos / Materias Primas */}
              <div className="space-y-2 p-3.5 rounded-xl bg-muted/40 border border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Boxes className="size-3.5 text-amber-500" />
                  <span>Insumos / Materias Primas de Receta ({alertasStock.filter(a => a.tipo === "INSUMO").length})</span>
                </h3>

                {alertasStock.filter(a => a.tipo === "INSUMO").length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Sin alertas de insumos.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {alertasStock.filter(a => a.tipo === "INSUMO").map((a) => (
                      <li key={a.id} className="p-2 rounded-lg bg-background border border-border flex items-center justify-between gap-2">
                        <div>
                          <strong className="text-foreground block">{a.nombre}</strong>
                          <span className="text-[11px] text-muted-foreground font-mono">{a.mensaje}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${a.nivel === "CRITICO" ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"}`}>
                          {a.nivel}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Columna Productos Terminados y Platos por Receta */}
              <div className="space-y-2 p-3.5 rounded-xl bg-muted/40 border border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShoppingBag className="size-3.5 text-amber-500" />
                  <span>Productos Terminados & Platos ({alertasStock.filter(a => a.tipo !== "INSUMO").length})</span>
                </h3>

                {alertasStock.filter(a => a.tipo !== "INSUMO").length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Sin alertas en carta.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {alertasStock.filter(a => a.tipo !== "INSUMO").map((a) => (
                      <li key={a.id} className="p-2 rounded-lg bg-background border border-border flex items-center justify-between gap-2">
                        <div>
                          <strong className="text-foreground block">{a.nombre} <span className="text-[10px] text-muted-foreground">({a.categoria})</span></strong>
                          <span className="text-[11px] text-muted-foreground font-mono">{a.mensaje}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${a.nivel === "CRITICO" ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"}`}>
                          {a.nivel}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
  isPositive,
}: {
  titulo: string;
  valor: string | number;
  detalle?: string;
  isPositive?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card">
      <CardContent className="space-y-2 pt-5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {titulo}
        </p>
        <p className="font-display font-black text-3xl numeral text-foreground leading-none">
          {valor}
        </p>
        {detalle && (
          <p className={`font-mono text-[11px] ${isPositive ? "text-brand font-bold" : "text-muted-foreground"}`}>
            {detalle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Vacio() {
  return <p className="text-muted-foreground text-sm py-4 text-center">No hubo movimientos registrados en esta jornada.</p>;
}
