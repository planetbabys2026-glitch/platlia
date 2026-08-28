import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import {
  getAlertasInventario,
  getAnulaciones,
  getCostoYMargen,
  getHorasPico,
  getPorMetodoDePago,
  getPorTarifa,
  getProductosMasVendidos,
  getResumenDeJornada,
  getTiemposDeCocina,
} from "@/features/informes/queries";
import {
  contiene,
  diasDelPeriodo,
  etiquetaComparacion,
  etiquetaDePeriodo,
  periodoAnterior,
  periodoSiguiente,
  resolverPeriodo,
} from "@/features/informes/periodo";
import { formatDuracion } from "@/features/cocina/reglas";
import { EncabezadoPantalla } from "@/components/marca/pantalla";
import { SelectorPeriodo } from "./selector-periodo";
import { cn } from "@/lib/utils";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { formatCop, formatRateBp, promedioCop, variacionPorcentual } from "@/lib/money";
import { currentBusinessDate, formatBusinessDate, parseBusinessDate } from "@/lib/time";
import { AlertTriangle, ArrowRight, Boxes, ChefHat, Clock, ShoppingBag } from "lucide-react";

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

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{
    jornada?: string;
    vista?: string;
    periodo?: string;
    desde?: string;
    hasta?: string;
  }>;
}) {
  const ctx = await requireModule(AppModule.INFORMES);
  const settings = await getSettings(ctx.business.id);
  if (!tienePermisoSeccion(ctx.role, "informes", settings.rolePermissions)) {
    notFound();
  }
  const params = await searchParams;

  /**
   * Qué sección de informes se está mirando.
   *
   * Era una sola página con cinco bloques uno debajo del otro: para llegar a las
   * anulaciones había que pasar de largo todo lo demás. Ahora cada bloque es una
   * entrada del menú, y la sección viaja en la URL —igual que el período— así que
   * se puede enlazar y compartir.
   */
  const seccion = ["productos", "horas", "cocina", "costos", "anulaciones", "inventario"].includes(
    params.vista ?? "",
  )
    ? (params.vista as "productos" | "horas" | "cocina" | "costos" | "anulaciones" | "inventario")
    : "ventas";

  const hoy = currentBusinessDate(settings);

  /**
   * Una fecha de la URL que no se puede leer no tumba la pantalla: se ignora y se
   * cae al día de hoy. Es texto que cualquiera puede escribir a mano en la barra.
   */
  const dia = (iso: string | undefined, porDefecto: Date | null = null): Date | null => {
    if (!iso) return porDefecto;
    try {
      return parseBusinessDate(iso);
    } catch {
      return porDefecto;
    }
  };

  const periodo = resolverPeriodo({
    tipo: params.periodo,
    ancla: dia(params.jornada, hoy)!,
    desde: dia(params.desde),
    hasta: dia(params.hasta),
  });
  const previo = periodoAnterior(periodo);

  const [
    resumen,
    resumenAnterior,
    porMetodo,
    porTarifa,
    top,
    anulaciones,
    alertasStock,
    margen,
    horas,
    cocina,
  ] = await Promise.all([
    getResumenDeJornada(ctx.business.id, periodo),
    getResumenDeJornada(ctx.business.id, previo),
    getPorMetodoDePago(ctx.business.id, periodo),
    getPorTarifa(ctx.business.id, periodo),
    getProductosMasVendidos(ctx.business.id, periodo),
    getAnulaciones(ctx.business.id, periodo),
    getAlertasInventario(ctx.business.id),
    getCostoYMargen(ctx.business.id, periodo),
    getHorasPico(ctx.business.id, periodo, settings.timeZone),
    getTiemposDeCocina(ctx.business.id, periodo),
  ]);

  const variacion = variacionPorcentual(resumen.ventasCop, resumenAnterior.ventasCop);
  const ticket = promedioCop(resumen.ventasCop, resumen.pedidos);
  const enCurso = contiene(periodo, hoy);
  const dias = diasDelPeriodo(periodo);
  const comparacion = etiquetaComparacion(periodo);
  // Sin esto, las flechas y el "volver a hoy" invitan a mirar un tramo que
  // todavía no existe: un informe de la semana que viene siempre da cero.
  const hayFuturo = periodoSiguiente(periodo).desde.getTime() <= hoy.getTime();

  return (
    <div className="space-y-8">
      <EncabezadoPantalla
        titulo="Informes & Ventas"
        descripcion={
          dias === 1
            ? "Lo que pasó en la jornada, con el corte del día de negocio de la empresa."
            : `Lo que pasó en ${dias} jornadas, con el corte del día de negocio de la empresa.`
        }
        acciones={
          enCurso ? (
            <span className="chip is-hot">
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              En curso
            </span>
          ) : null
        }
      />

      <SelectorPeriodo
        periodo={periodo}
        etiqueta={etiquetaDePeriodo(periodo)}
        hoy={formatBusinessDate(hoy)}
        hayFuturo={hayFuturo}
      />

      {seccion === "ventas" && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="VENTAS FACTURADAS"
          valor={formatCop(resumen.ventasCop)}
          detalle={
            variacion === null
              ? `Sin ventas registradas ${comparacionSinVs(comparacion)}`
              : `${variacion >= 0 ? "+" : ""}${variacion}% ${comparacion}`
          }
          isPositive={variacion !== null && variacion >= 0}
        />
        <Indicador
          titulo="TOTAL COMANDAS"
          valor={resumen.pedidos}
          unidad={resumen.pedidos === 1 ? "pedido" : "pedidos"}
          detalle={
            dias === 1
              ? "Comandas de salón, mostrador y domicilios"
              : `${promedioPorDia(resumen.pedidos, dias)} por jornada, en promedio`
          }
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

      {seccion === "horas" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Indicador
              titulo="HORA PICO"
              valor={horas.pico ? franjaDe(horas.pico.hora) : "—"}
              detalle={
                horas.pico
                  ? `${horas.pico.pedidos} ${horas.pico.pedidos === 1 ? "pedido se abrió" : "pedidos se abrieron"} en esa franja`
                  : "Todavía no hay pedidos cobrados en el período"
              }
            />
            <Indicador
              titulo="FRANJAS CON MOVIMIENTO"
              valor={horas.franjas.filter((f) => f.pedidos > 0).length}
              unidad="de 24"
              detalle="Horas del día en las que se abrió al menos un pedido"
            />
            <Indicador
              titulo="PEDIDOS POR JORNADA"
              valor={promedioPorDia(horas.pedidos, horas.dias)}
              detalle={`${horas.pedidos} en ${horas.dias} ${horas.dias === 1 ? "jornada" : "jornadas"}`}
            />
          </div>

          <Card className="border-border/80 bg-card">
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
                <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                  Cuándo entra el trabajo
                </h2>
                <span className="font-mono text-rotulo text-muted-foreground">HORA DE {settings.timeZone.split("/").pop()?.toUpperCase()}</span>
              </div>

              {/* Se cuenta cuándo ENTRA el pedido, no cuándo se paga: la pregunta
                  es a qué hora hay que tener gente, y una mesa que se abre a las 8
                  y paga a las 11 es trabajo de las 8. */}
              <p className="text-sm text-muted-foreground">
                Cada barra es la hora en que el pedido se abrió, no en la que se cobró: es lo que
                dice a qué hora hace falta gente en el piso.
              </p>

              {horas.pedidos === 0 ? (
                <Vacio />
              ) : (
                <GraficoDeHoras franjas={horas.franjas} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {seccion === "cocina" && !cocina.kdsActivo && (
        <Card className="border-border/80 bg-card">
          <CardContent className="space-y-2 pt-5">
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
              Tiempos de cocina
            </h2>
            {/* Sin KDS nadie toca "empezar" ni "listo": no hay un solo tiempo que
                medir, y una tabla de guiones se lee como un error del sistema. */}
            <p className="text-muted-foreground text-sm">
              Estos tiempos se miden con los toques de la pantalla de cocina, y este negocio tiene la
              comanda configurada solo para imprimirse. Activá el KDS en{" "}
              <Link href="/administracion/configuracion?vista=modulos" className="text-brand font-semibold">
                Configuración → Módulos
              </Link>{" "}
              para que la cocina marque cada plato al empezarlo y al terminarlo.
            </p>
          </CardContent>
        </Card>
      )}

      {seccion === "cocina" && cocina.kdsActivo && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Indicador
              titulo="ESPERA ANTES DE EMPEZAR"
              valor={formatDuracion(cocina.esperaPromedioMs)}
              detalle={
                cocina.medidosEspera === 0
                  ? "Todavía sin datos en el período"
                  : `De que la comanda entra a que alguien la toma · ${cocina.medidosEspera} renglones`
              }
            />
            <Indicador
              titulo="TIEMPO DE PREPARACIÓN"
              valor={formatDuracion(cocina.preparacionPromedioMs)}
              detalle={
                cocina.medidosPreparacion === 0
                  ? "Todavía sin datos en el período"
                  : `De que se toma a que sale · ${cocina.medidosPreparacion} renglones`
              }
            />
            <Indicador
              titulo="RENGLONES TOMADOS"
              valor={cocina.renglones}
              unidad={cocina.renglones === 1 ? "plato" : "platos"}
              detalle="Los que alguien tomó en la pantalla de cocina"
            />
          </div>

          {/* Los dos tramos se muestran separados porque se arreglan distinto: la
              espera con más gente, la preparación con otra receta o más equipo. El
              promedio de los dos no manda a hacer ninguna de las dos cosas. */}
          <Card className="border-border/80 bg-card">
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center justify-between border-b border-dashed border-border/80 pb-2">
                <h2 className="font-display font-black text-xl uppercase tracking-tight text-foreground">
                  Por cocinero
                </h2>
                <span className="font-mono text-rotulo text-muted-foreground">QUIÉN TOMÓ CADA PLATO</span>
              </div>

              {cocina.cocineros.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nadie tomó platos en la pantalla de cocina durante este período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                      <tr className="font-mono text-rotulo uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="pb-2 text-left font-normal">Cocinero</th>
                        <th className="pb-2 text-right font-normal">Platos</th>
                        <th className="pb-2 text-right font-normal">Espera</th>
                        <th className="pb-2 text-right font-normal">Preparación</th>
                        <th className="pb-2 text-right font-normal">Relevados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/60 divide-y divide-dashed">
                      {cocina.cocineros.map((c) => (
                        <tr key={c.cocineroId}>
                          <td className="py-2.5 pr-3 font-medium text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <ChefHat aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                              {c.cocinero}
                            </span>
                          </td>
                          <td className="numeral py-2.5 text-right text-foreground">{c.renglones}</td>
                          <td className="numeral py-2.5 text-right text-muted-foreground">
                            {formatDuracion(c.esperaPromedioMs)}
                          </td>
                          <td className="numeral py-2.5 text-right font-bold text-foreground">
                            {formatDuracion(c.preparacionPromedioMs)}
                          </td>
                          <td className="numeral py-2.5 text-right text-muted-foreground">
                            {c.relevados === 0 ? "—" : c.relevados}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {cocina.cocineros.some((c) => c.relevados > 0) && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <strong className="font-semibold text-foreground">Relevados</strong> son los platos
                    que terminó otra persona —un administrador destrabando una comanda—. Ese tiempo no
                    es tiempo de cocción de quien empezó, así que conviene leerlo aparte.
                  </span>
                </p>
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
            <span className="font-mono text-rotulo text-muted-foreground">TOP DEL PERÍODO</span>
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
              detalle={margen.margenPct === null ? "Sin ventas en el período" : "De cada peso vendido"}
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
          No hubo anulaciones en este período. Es la mejor noticia que puede dar esta pantalla.
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

/** "vs. mes anterior" → "el mes anterior". Para la frase que no compara nada. */
function comparacionSinVs(etiqueta: string): string {
  return etiqueta.replace(/^vs\. /, "el ");
}

function promedioPorDia(total: number, dias: number): string {
  return dias <= 0 ? "0" : (Math.round((total / dias) * 10) / 10).toLocaleString("es-CO");
}

/** "14:00" — la franja, no un instante. */
function franjaDe(hora: number): string {
  return `${String(hora).padStart(2, "0")}:00`;
}

/**
 * Las 24 franjas como barras.
 *
 * Barras horizontales y no verticales: los rótulos de hora son 24 y en vertical
 * habría que girarlos o saltearlos, que es como se termina con un eje que no se
 * puede leer en un teléfono. Y las horas vacías se dibujan igual —con la barra en
 * cero— porque el hueco entre el almuerzo y la noche es un dato: sin él, el
 * gráfico muestra dos picos pegados y parece que el local no cierra nunca.
 *
 * Sin librería: son 24 divs con un ancho porcentual. Una dependencia de gráficos
 * son ~50 KB en el bundle para dibujar un rectángulo.
 */
function GraficoDeHoras({ franjas }: { franjas: { hora: number; pedidos: number; ventasCop: number }[] }) {
  const maximo = Math.max(...franjas.map((f) => f.pedidos), 1);
  // Las horas de punta a punta sin movimiento no dicen nada y se comen la
  // pantalla: se recorta a la ventana en la que el local realmente opera.
  const conMovimiento = franjas.filter((f) => f.pedidos > 0);
  const primera = conMovimiento.length > 0 ? conMovimiento[0].hora : 0;
  const ultima = conMovimiento.length > 0 ? conMovimiento[conMovimiento.length - 1].hora : 23;
  const visibles = franjas.filter((f) => f.hora >= primera && f.hora <= ultima);

  return (
    <ul className="space-y-1">
      {visibles.map((f) => {
        const proporcion = f.pedidos / maximo;
        const pico = f.pedidos === maximo && f.pedidos > 0;
        return (
          <li key={f.hora} className="flex items-center gap-3">
            <span className="numeral w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
              {franjaDe(f.hora)}
            </span>
            <span className="h-5 flex-1 overflow-hidden rounded-md bg-[var(--panel-2)]">
              <span
                aria-hidden
                className={cn(
                  "block h-full rounded-md transition-[width]",
                  pico ? "bg-brand" : "bg-[var(--linea-30)]",
                )}
                style={{ width: `${Math.max(proporcion * 100, f.pedidos > 0 ? 2 : 0)}%` }}
              />
            </span>
            <span className="numeral w-24 shrink-0 text-right font-mono text-xs text-foreground">
              {f.pedidos}
              <span className="ml-1.5 font-sans text-muted-foreground">
                {f.pedidos === 1 ? "pedido" : "pedidos"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Vacio() {
  return <p className="text-muted-foreground text-sm py-4 text-center">No hubo movimientos registrados en este período.</p>;
}
