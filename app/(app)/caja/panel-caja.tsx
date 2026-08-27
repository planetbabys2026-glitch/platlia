"use client";

import { useVistaEnUrl } from "@/lib/vista-en-url";
import { Card, CardContent } from "@/components/ui/card";
import { formatCop } from "@/lib/money";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { vistaInicialDeCaja } from "../navegacion";
import { CuentasPorCobrar } from "./cuentas-por-cobrar";
import { InterruptorDomiciliosQr } from "@/features/domicilios/components/interruptor-qr";
import { AbrirCaja, CerrarCaja, Movimiento } from "./formularios";
import { VentasCobradas } from "./ventas-cobradas";

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
  cobradas: React.ComponentProps<typeof VentasCobradas>["pedidos"];
  cobradasTotal: number;
  cobradasTope: number;
  jornada: Date;
  esHoy: boolean;
  /** Si el negocio está en condiciones de emitir factura electrónica. */
  puedeFacturar: boolean;
  /** Si el negocio sugiere propina al cobrar, y con qué tarifa. */
  propina: { habilitada: boolean; rateBp: number };
  /** Null si el negocio no reparte: ahí no hay nada que abrir ni que cerrar. */
  domiciliosQr: { abierto: boolean } | null;
  timeZone: string;
};

export function PanelCaja({
  caja,
  ultimoCierre,
  resumen,
  movimientos,
  cuentas,
  cobradas,
  cobradasTotal,
  cobradasTope,
  jornada,
  esHoy,
  puedeFacturar,
  propina,
  domiciliosQr,
  timeZone,
}: PanelCajaProps) {
  /**
   * La sección vive en la URL para que el menú lateral pueda enlazarla, y la
   * tira de píldoras que había acá se fue: el menú es el único navegador, como
   * en Informes.
   *
   * La vista de entrada sale del mismo lugar que la lista del menú, para que no
   * puedan divergir.
   */
  const [tabActiva] = useVistaEnUrl(
    "vista",
    ["cobros", "cobradas", "movimientos"] as const,
    vistaInicialDeCaja(),
  );

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          MÓDULO 1: COBRO DE CUENTAS
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "cobros" && (
        <CuentasPorCobrar
          cuentas={cuentas}
          puedeFacturar={puedeFacturar}
          propina={propina}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          MÓDULO 2: LO QUE YA SE COBRÓ
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "cobradas" && (
        <VentasCobradas
          pedidos={cobradas}
          puedeFacturar={puedeFacturar}
          total={cobradasTotal}
          tope={cobradasTope}
          jornada={jornada}
          esHoy={esHoy}
          timeZone={timeZone}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          MÓDULO 3: MOVIMIENTOS, ARQUEO Y CIERRE DE TURNO
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "movimientos" && (
        <div className="space-y-6">
          {/* El interruptor de los domicilios por QR, en la misma pantalla donde
              se abre y se cierra el turno.
              Va acá arriba y fuera del `if` de la caja a propósito: se enciende al
              abrir —cuando todavía no hay turno— y se apaga al cerrar. Si viviera
              adentro de una de las dos ramas, faltaría justo en el momento en que
              hace falta. */}
          {domiciliosQr && (
            <div className="mx-auto max-w-md doble:max-w-none">
              <InterruptorDomiciliosQr abierto={domiciliosQr.abierto} />
            </div>
          )}

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
                                  <span className="text-muted-foreground ml-2 text-rotulo">
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
                                <span className="text-rotulo font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
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
