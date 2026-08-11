"use client";

import { useState } from "react";
import { ArrowDownUp, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCop } from "@/lib/money";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CuentasPorCobrar } from "./cuentas-por-cobrar";
import { AbrirCaja, CerrarCaja, Movimiento } from "./formularios";

const TIPO: Record<string, string> = {
  INGRESO: "Entrada",
  EGRESO: "Gasto",
  RETIRO: "Retiro",
  AJUSTE: "Ajuste",
};

type PanelCajaProps = {
  caja: {
    id: string;
    code: number;
    openedAt: Date;
    openedBy: { name: string };
  } | null;
  ultimoCierre: {
    code: number;
    closedAt: Date | null;
    closedBy: { name: string } | null;
    expectedCashCop: number | null;
    countedCashCop: number | null;
    differenceCop: number | null;
    notes: string | null;
  } | null;
  resumen: {
    openingFloatCop: number;
    efectivoVentasCop: number;
    ingresosCop: number;
    egresosCop: number;
    esperadoCop: number;
    porMetodo: Array<{ method: string; cantidad: number; totalCop: number }>;
  } | null;
  movimientos: Array<{
    id: string;
    type: string;
    concept: string;
    amountCop: number;
    createdAt: Date;
  }>;
  cuentas: React.ComponentProps<typeof CuentasPorCobrar>["cuentas"];
  usaMesas: boolean;
  timeZone: string;
};

export function PanelCaja({
  caja,
  ultimoCierre,
  resumen,
  movimientos,
  cuentas,
  usaMesas,
  timeZone,
}: PanelCajaProps) {
  // Píldora inicial: si hay mesas activas y cuentas por cobrar, arranca en "cobros", de lo contrario en "movimientos"
  const [tabActiva, setTabActiva] = useState<"cobros" | "movimientos">(
    usaMesas && cuentas.length > 0 ? "cobros" : "movimientos",
  );

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          Navegación por Píldoras (Los 2 Módulos de Caja)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-3 overflow-x-auto scrollbar-none">
        {usaMesas && (
          <button
            type="button"
            onClick={() => setTabActiva("cobros")}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap border shrink-0",
              tabActiva === "cobros"
                ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] font-bold shadow-md scale-[1.02]"
                : "bg-[var(--panel-2)] text-[var(--muted)] border-[var(--linea-30)] hover:text-[var(--papel)]",
            )}
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span>Cobro de Cuentas (Salón / Mesas)</span>
            {cuentas.length > 0 && (
              <span
                className={cn(
                  "ml-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                  tabActiva === "cobros"
                    ? "bg-[var(--tinta)] text-[var(--papel)]"
                    : "bg-[var(--brasa)]/20 text-[var(--brasa)]",
                )}
              >
                {cuentas.length}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setTabActiva("movimientos")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap border shrink-0",
            tabActiva === "movimientos"
              ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] font-bold shadow-md scale-[1.02]"
              : "bg-[var(--panel-2)] text-[var(--muted)] border-[var(--linea-30)] hover:text-[var(--papel)]",
          )}
        >
          <ArrowDownUp className="h-4 w-4 shrink-0" />
          <span>Movimientos y Cierre de Turno</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MÓDULO 1: COBRO DE CUENTAS (SALÓN / MESAS)
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "cobros" && usaMesas && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Cobro de Cuentas por Cobrar</h2>
            <p className="text-xs text-muted-foreground">
              Tickets y pedidos enviados a la caja desde el módulo de Salón.
            </p>
          </div>
          <CuentasPorCobrar cuentas={cuentas} />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MÓDULO 2: MOVIMIENTOS, ARQUEO Y CIERRE DE TURNO
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "movimientos" && (
        <div className="space-y-6">
          {!caja ? (
            /* Sin turno abierto */
            <div className="mx-auto max-w-md space-y-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">Cierre y Apertura de Caja</h2>
                <p className="text-muted-foreground text-xs">
                  No hay ningún turno de caja abierto. Abrí la caja para poder operar.
                </p>
              </div>

              {ultimoCierre && (
                <Card className="shadow-sm">
                  <CardContent className="space-y-2 pt-5">
                    <h3 className="font-semibold text-sm">Último Cierre de Caja</h3>
                    <p className="text-muted-foreground text-xs">
                      Turno {ultimoCierre.code} · cerró {ultimoCierre.closedBy?.name ?? "—"}
                      {ultimoCierre.closedAt &&
                        ` · ${formatDateTimeInTimeZone(ultimoCierre.closedAt, timeZone)}`}
                    </p>
                    <dl className="space-y-1 text-xs">
                      <Fila termino="Esperado en efectivo" valor={ultimoCierre.expectedCashCop ?? 0} />
                      <Fila termino="Contado en cajón" valor={ultimoCierre.countedCashCop ?? 0} />
                      <div className="border-border flex items-baseline justify-between border-t pt-2">
                        <dt className="font-semibold">Diferencia</dt>
                        <dd
                          className={cn(
                            "numeral text-base font-bold",
                            (ultimoCierre.differenceCop ?? 0) !== 0 && "text-destructive",
                          )}
                        >
                          {formatCop(ultimoCierre.differenceCop ?? 0)}
                        </dd>
                      </div>
                    </dl>
                    {ultimoCierre.notes && (
                      <p className="text-muted-foreground text-xs italic">{ultimoCierre.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="shadow-sm border-brand/40">
                <CardContent className="pt-5">
                  <h3 className="font-bold text-base mb-4">Abrir Nuevo Turno de Caja</h3>
                  <AbrirCaja />
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Turno abierto */
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <div className="space-y-6">
                {resumen && (
                  <>
                    <Card className="shadow-sm">
                      <CardContent className="space-y-3 pt-5">
                        <h3 className="font-bold text-base">Arqueo Esperado de Efectivo</h3>
                        <dl className="space-y-1 text-xs">
                          <Fila termino="Base inicial del turno" valor={resumen.openingFloatCop} />
                          <Fila termino="Ventas cobradas en efectivo" valor={resumen.efectivoVentasCop} />
                          <Fila termino="Entradas y ajustes" valor={resumen.ingresosCop} />
                          <Fila termino="Gastos y retiros" valor={-resumen.egresosCop} />
                          <div className="border-border flex items-baseline justify-between border-t pt-2">
                            <dt className="font-bold text-sm">Esperado en efectivo</dt>
                            <dd className="numeral text-2xl font-black text-brand dark:text-brand-accent">
                              {formatCop(resumen.esperadoCop)}
                            </dd>
                          </div>
                        </dl>
                      </CardContent>
                    </Card>

                    {resumen.porMetodo.length > 0 && (
                      <Card className="shadow-sm">
                        <CardContent className="space-y-3 pt-5">
                          <h3 className="font-semibold text-sm">Total de Cobros por Método</h3>
                          <ul className="divide-border divide-y text-xs">
                            {resumen.porMetodo.map((metodo) => (
                              <li
                                key={metodo.method}
                                className="flex items-center justify-between gap-2 py-2 first:pt-0"
                              >
                                <span>
                                  <strong className="font-semibold">{metodo.method}</strong>
                                  <span className="text-muted-foreground ml-2 text-[11px]">
                                    ({metodo.cantidad} {metodo.cantidad === 1 ? "cobro" : "cobros"})
                                  </span>
                                </span>
                                <span className="numeral font-bold">{formatCop(metodo.totalCop)}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}

                {/* Registro de Movimientos (Entradas y Salidas de dinero) */}
                <Card className="shadow-sm">
                  <CardContent className="space-y-4 pt-5">
                    <div className="space-y-1">
                      <h3 className="font-bold text-base">Registrar Entrada / Salida de Dinero</h3>
                      <p className="text-xs text-muted-foreground">
                        Ingresos extras, pagos a proveedores, gastos menores o retiros parciales de caja.
                      </p>
                    </div>
                    <Movimiento />

                    {movimientos.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Historial de movimientos del turno
                        </h4>
                        <ul className="divide-border divide-y border border-border/80 rounded-xl overflow-hidden text-xs">
                          {movimientos.map((mov) => (
                            <li key={mov.id} className="flex items-center justify-between p-3 bg-card">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                  {TIPO[mov.type] ?? mov.type}
                                </span>
                                <p className="font-semibold text-foreground mt-1">{mov.concept}</p>
                              </div>
                              <span className="numeral font-bold text-sm">
                                {formatCop(mov.amountCop)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Panel Lateral de Cierre de Turno */}
              {resumen && (
                <aside className="lg:sticky lg:top-20 lg:self-start">
                  <Card className="shadow-md border-destructive/20">
                    <CardContent className="space-y-3 pt-5">
                      <h3 className="font-bold text-base text-destructive">Cierre de Turno de Caja</h3>
                      <p className="text-xs text-muted-foreground">
                        Ingresá el dinero físico contado en el cajón para calcular arqueo y cerrar el turno.
                      </p>
                      <CerrarCaja esperadoCop={resumen.esperadoCop} />
                    </CardContent>
                  </Card>
                </aside>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fila({ termino, valor }: { termino: string; valor: number }) {
  return (
    <div className="text-muted-foreground flex justify-between gap-2 py-0.5">
      <dt>{termino}</dt>
      <dd className="numeral font-medium">{formatCop(valor)}</dd>
    </div>
  );
}
