import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import {
  getAlertasInventario,
  getAnulaciones,
  getCostoYMargen,
  getPorMetodoDePago,
  getPorTarifa,
  getProductosMasVendidos,
  getResumenDeJornada,
} from "@/features/informes/queries";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
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
  searchParams: Promise<{ jornada?: string; vista?: string }>;
}) {
  const ctx = await requireModule(AppModule.INFORMES);
  const settings = await getSettings(ctx.business.id);
  if (!tienePermisoSeccion(ctx.role, "informes", settings.rolePermissions)) {
    notFound();
  }
  const { jornada, vista } = await searchParams;

  /**
   * Qué sección de informes se está mirando.
   *
   * Era una sola página con cinco bloques uno debajo del otro: para llegar a las
   * anulaciones había que pasar de largo todo lo demás. Ahora cada bloque es una
   * entrada del menú, y la sección viaja en la URL —igual que la jornada— así que
   * se puede enlazar y compartir.
   */
  const seccion = ["productos", "costos", "anulaciones", "inventario"].includes(vista ?? "")
    ? (vista as "productos" | "costos" | "anulaciones" | "inventario")
    : "ventas";

  let dia: Date;
  try {
    dia = jornada ? parseBusinessDate(jornada) : currentBusinessDate(settings);
  } catch {
    dia = currentBusinessDate(settings);
  }

  const anterior = new Date(dia.getTime() - DIA_MS);
  const hoy = currentBusinessDate(settings);

  const [resumen, resumenAnterior, porMetodo, porTarifa, top, anulaciones, alertasStock, margen] =
    await Promise.all([
      getResumenDeJornada(ctx.business.id, dia),
      getResumenDeJornada(ctx.business.id, anterior),
      getPorMetodoDePago(ctx.business.id, dia),
      getPorTarifa(ctx.business.id, dia),
      getProductosMasVendidos(ctx.business.id, dia),
      getAnulaciones(ctx.business.id, dia),
      getAlertasInventario(ctx.business.id),
      getCostoYMargen(ctx.business.id, dia),
    ]);

  const variacion = variacionPorcentual(resumen.ventasCop, resumenAnterior.ventasCop);
  const ticket = promedioCop(resumen.ventasCop, resumen.pedidos);
  const esHoy = dia.getTime() === hoy.getTime();

  return (
    <div className="space-y-8">
      {/* ─── Header Informes Dark Kitchen-Fire ─── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div>
          <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">
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
            className="inline-flex min-h-11 tableta:min-h-8 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Día anterior
          </Link>
          {!esHoy && (
            <Link
              href="/informes"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/50 bg-brand/10 text-xs font-bold text-brand hover:bg-brand/20 transition-colors"
            >
              Ver hoy <ArrowRight className="size-3.5" />
            </Link>
          )}
        </nav>
      </div>

      {seccion === "ventas" && (
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
          valor={resumen.pedidos}
          unidad={resumen.pedidos === 1 ? "pedido" : "pedidos"}
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

      )}

      {seccion === "ventas" && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Medios de Pago
              </h2>
              <span className="font-mono text-rotulo text-muted-foreground">RECAUDO</span>
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
              <span className="font-mono text-rotulo text-muted-foreground">IMPOCONSUMO (ICO) / IVA</span>
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

      )}

      {seccion === "productos" && (
      <Card className="border-border/80 bg-card">
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
              Ranking de Platos y Bebidas Más Vendidos
            </h2>
            <span className="font-mono text-rotulo text-muted-foreground">TOP DE LA JORNADA</span>
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

      )}

      {seccion === "costos" && !margen.inventarioActivo && (
        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-2 pt-5">
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
              Costos y margen
            </h2>
            {/* Con el inventario apagado no hay costos, y decir "margen 100%"
                sería mentir por omisión: cada plato costó algo, solo que este
                sistema no lo sabe. */}
            <p className="text-muted-foreground text-sm">
              El inventario no está activo, así que no hay costos cargados y no se puede calcular
              la ganancia real. Activalo en{" "}
              <Link href="/administracion/configuracion?vista=modulos" className="text-brand font-semibold">
                Configuración → Módulos
              </Link>{" "}
              y cargá el costo de cada insumo y de cada producto de reventa.
            </p>
          </CardContent>
        </Card>
      )}

      {seccion === "costos" && margen.inventarioActivo && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="VENTA NETA"
              valor={formatCop(margen.ventaNetaCop)}
              detalle="Base gravable, sin el impuesto que se entrega"
            />
            <Indicador titulo="COSTO DE VENTAS" valor={formatCop(margen.costoCop)} detalle="Insumos y mercadería consumidos" />
            <Indicador
              titulo="UTILIDAD BRUTA"
              valor={formatCop(margen.utilidadCop)}
              isPositive={margen.utilidadCop > 0}
              detalle={margen.utilidadCop < 0 ? "Se vendió por debajo del costo" : undefined}
            />
            <Indicador
              titulo="MARGEN"
              valor={margen.margenPct === null ? "—" : `${margen.margenPct}%`}
              detalle={margen.margenPct === null ? "Sin ventas en la jornada" : "De cada peso vendido"}
            />
          </div>

          {margen.renglonesSinCosto > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-soft">
              <AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" />
              <span>
                <strong className="text-foreground font-bold">
                  {margen.renglonesSinCosto} de {margen.renglonesTotales} renglones
                </strong>{" "}
                se vendieron sin costo conocido, así que la utilidad de arriba está por encima de la
                real. Suele ser porque el producto todavía no tiene costo cargado, o porque se vendió
                antes de activar el inventario.
              </span>
            </div>
          )}

          <Card className="border-border/80 bg-card">
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
                <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                  Ganancia por producto
                </h2>
                <span className="font-mono text-rotulo text-muted-foreground">DE MAYOR A MENOR</span>
              </div>

              {margen.productos.length === 0 ? (
                <Vacio />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[34rem]">
                    <thead>
                      <tr className="font-mono text-rotulo text-muted-foreground uppercase tracking-[0.14em]">
                        <th className="text-left font-normal pb-2">Producto</th>
                        <th className="text-right font-normal pb-2">Unid.</th>
                        <th className="text-right font-normal pb-2">Venta neta</th>
                        <th className="text-right font-normal pb-2">Costo</th>
                        <th className="text-right font-normal pb-2">Utilidad</th>
                        <th className="text-right font-normal pb-2">Margen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/60 divide-y divide-dashed">
                      {margen.productos.map((p) => (
                        <tr key={p.productId}>
                          <td className="py-2.5 pr-3 font-medium text-foreground">
                            {p.nombre}
                            {p.renglonesSinCosto > 0 && (
                              <span className="text-rotulo text-warning-soft ml-2 font-mono">SIN COSTO</span>
                            )}
                          </td>
                          <td className="numeral py-2.5 text-right text-muted-foreground">{p.unidades}</td>
                          <td className="numeral py-2.5 text-right text-foreground">{formatCop(p.ventaNetaCop)}</td>
                          <td className="numeral py-2.5 text-right text-muted-foreground">{formatCop(p.costoCop)}</td>
                          <td
                            className={`numeral py-2.5 text-right font-bold ${
                              p.utilidadCop < 0 ? "text-destructive-soft" : "text-foreground"
                            }`}
                          >
                            {formatCop(p.utilidadCop)}
                          </td>
                          <td className="numeral py-2.5 text-right text-muted-foreground">
                            {p.margenPct === null ? "—" : `${p.margenPct}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {seccion === "anulaciones" && (anulaciones.renglones.length > 0 || anulaciones.pedidosAnulados > 0) && (
        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Auditoría de Anulaciones
              </h2>
              <span className="font-mono text-rotulo text-brand font-bold">SEGURIDAD FISCAL</span>
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

      {seccion === "anulaciones" && anulaciones.renglones.length === 0 && anulaciones.pedidosAnulados === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--linea-30)] p-8 text-center text-sm text-muted-foreground">
          No hubo anulaciones en esta jornada. Es la mejor noticia que puede dar esta pantalla.
        </p>
      )}

      {seccion === "inventario" && (
      <Card className="border-border/80 bg-card overflow-hidden">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning-soft" />
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                Alertas de Inventario & Abastecimiento
              </h2>
            </div>
            <Link
              href="/inventario"
              className="inline-flex min-h-11 tableta:min-h-8 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/40 bg-brand/10 text-xs font-bold text-brand hover:bg-brand/20 transition-colors"
            >
              <Boxes className="size-3.5" /> Ir a cargar compras o ajustar inventario <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {alertasStock.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground font-mono bg-success/5 rounded-xl border border-success/20">
              🟢 Todos los inventarios (Productos Terminados e Insumos de Receta) cuentan con stock saludable.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Columna Insumos / Materias Primas */}
              <div className="space-y-2 p-3.5 rounded-xl bg-muted/40 border border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Boxes className="size-3.5 text-warning-soft" />
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
                          <span className="text-rotulo text-muted-foreground font-mono">{a.mensaje}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-rotulo font-bold font-mono ${a.nivel === "CRITICO" ? "bg-destructive/10 text-destructive-soft border border-destructive/20" : "bg-warning/10 text-warning-soft border border-warning/20"}`}>
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
                  <ShoppingBag className="size-3.5 text-warning-soft" />
                  <span>Productos Terminados & Platos ({alertasStock.filter(a => a.tipo !== "INSUMO").length})</span>
                </h3>

                {alertasStock.filter(a => a.tipo !== "INSUMO").length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Sin alertas en carta.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {alertasStock.filter(a => a.tipo !== "INSUMO").map((a) => (
                      <li key={a.id} className="p-2 rounded-lg bg-background border border-border flex items-center justify-between gap-2">
                        <div>
                          <strong className="text-foreground block">{a.nombre} <span className="text-rotulo text-muted-foreground">({a.categoria})</span></strong>
                          <span className="text-rotulo text-muted-foreground font-mono">{a.mensaje}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-rotulo font-bold font-mono ${a.nivel === "CRITICO" ? "bg-destructive/10 text-destructive-soft border border-destructive/20" : "bg-warning/10 text-warning-soft border border-warning/20"}`}>
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
      )}
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  unidad,
  detalle,
  isPositive,
}: {
  titulo: string;
  valor: string | number;
  /** La palabra que acompaña a la cifra. Va aparte porque NO es monoespaciada. */
  unidad?: string;
  detalle?: string;
  isPositive?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card">
      <CardContent className="space-y-2 pt-5">
        <p className="font-mono text-rotulo uppercase tracking-[0.14em] text-muted-foreground">
          {titulo}
        </p>
        {/* Solo `numeral`: `font-display` y `numeral` declaran los dos la familia
            y se estaban pisando. La plata va en Space Mono —lo dice el manual— y
            además es lo que alinea las cifras cuando hay cuatro tarjetas en fila. */}
        <p className="text-3xl font-bold leading-none text-foreground">
          <span className="numeral">{valor}</span>
          {/* La unidad en General Sans: en mono, el ancho fijo de cada letra hace
              que "pedidos" se lea separado de su número, como si fueran dos datos. */}
          {unidad && <span className="ml-2.5 text-lg font-semibold text-muted-foreground">{unidad}</span>}
        </p>
        {detalle && (
          // En General Sans, no en mono: es una frase, no una cifra. Una oración
          // en monoespaciada se lee letra por letra.
          <p className={`text-xs ${isPositive ? "font-bold text-brand" : "text-muted-foreground"}`}>
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
