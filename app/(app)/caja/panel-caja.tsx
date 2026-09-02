"use client";

import { useVistaEnUrl } from "@/lib/vista-en-url";
import { Card, CardContent } from "@/components/ui/card";
import { formatCop } from "@/lib/money";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { vistaInicialDeCaja } from "../navegacion";
import { CuentasPorCobrar } from "./cuentas-por-cobrar";
import { InterruptorDomiciliosQr } from "@/features/domicilios/components/interruptor-qr";
import { EscuchaDeCaja } from "./escucha";
import { AbrirCaja, CerrarCaja, Movimiento } from "./formularios";
import { VentasCobradas } from "./ventas-cobradas";

const TIPO: Record<string, string> = {
  INGRESO: "Entrada",
  EGRESO: "Gasto",
  RETIRO: "Retiro",
  AJUSTE: "Ajuste",
};

const CUENTA: Record<string, string> = {
  EFECTIVO: "Efectivo",
  BANCO: "Bancos",
  OTRO: "Otros",
  CREDITO: "Fiado",
};

type SaldoProp = {
  baseCop: number;
  ventasCop: number;
  ingresosCop: number;
  egresosCop: number;
  esperadoCop: number;
};

type PanelCajaProps = {
  caja: {
    id: string;
    code: number;
    openedAt: Date;
    openedBy: { name: string };
    cashRegister: { id: string; name: string };
  } | null;
  /** Las cajas físicas libres para abrir turno. */
  cajasDisponibles: Array<{ id: string; name: string }>;
  /** Los turnos que tienen otras personas, para explicar por qué falta una caja. */
  otrosTurnos: Array<{ caja: string; quien: string }>;
  ultimoCierre: {
    code: number;
    closedAt: Date | null;
    closedBy: { name: string } | null;
    expectedCashCop: number | null;
    countedCashCop: number | null;
    differenceCop: number | null;
    expectedBankCop: number | null;
    countedBankCop: number | null;
    differenceBankCop: number | null;
    notes: string | null;
    cashRegister: { name: string };
  } | null;
  resumen: {
    efectivo: SaldoProp;
    bancos: SaldoProp;
    otrosCop: number;
    fiadoCop: number;
    porMetodo: Array<{ method: string; cantidad: number; totalCop: number; cuenta: string }>;
  } | null;
  movimientos: Array<{
    id: string;
    type: string;
    account: string;
    concept: string;
    amountCop: number;
    createdAt: Date;
  }>;
  /** Si el propietario ya configuró la clave de salidas de dinero. */
  claveSalidasPuesta: boolean;
  cuentas: React.ComponentProps<typeof CuentasPorCobrar>["cuentas"];
  cobradas: React.ComponentProps<typeof VentasCobradas>["pedidos"];
  cobradasTotal: number;
  cobradasTope: number;
  jornada: Date;
  esHoy: boolean;
  /** Si el negocio está en condiciones de emitir factura electrónica. */
  puedeFacturar: boolean;
  /** Si el negocio fía. */
  puedeFiar: boolean;
  /** Si el negocio sugiere propina al cobrar, y con qué tarifa. */
  propina: { habilitada: boolean; rateBp: number };
  /** Null si el negocio no reparte: ahí no hay nada que abrir ni que cerrar. */
  domiciliosQr: { abierto: boolean } | null;
  timeZone: string;
};

export function PanelCaja({
  caja,
  cajasDisponibles,
  otrosTurnos,
  ultimoCierre,
  resumen,
  movimientos,
  claveSalidasPuesta,
  cuentas,
  cobradas,
  cobradasTotal,
  cobradasTope,
  jornada,
  esHoy,
  puedeFacturar,
  puedeFiar,
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
      {/* Siempre montado, en las tres secciones: lo que cambia —una comanda que
          entra, una cuenta que se cobra, un movimiento— afecta a las tres. */}
      <div className="flex justify-end">
        <EscuchaDeCaja />
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MÓDULO 1: COBRO DE CUENTAS
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "cobros" && (
        <CuentasPorCobrar
          cuentas={cuentas}
          puedeFacturar={puedeFacturar}
          puedeFiar={puedeFiar}
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
              {/* Abrir va PRIMERO. Con la caja cerrada es lo único que se puede
                  hacer, y estaba de tercera: detrás de un rótulo que repetía la
                  misma frase que el propio formulario y del arqueo del turno
                  anterior, que es consulta y no acción. */}
              <Card className="shadow-sm border-brand/40">
                <CardContent className="space-y-4 pt-5">
                  <div className="space-y-1.5">
                    <h2 className="rotulo-seccion">Abrir turno</h2>
                    <p className="text-sm text-muted-foreground">
                      {otrosTurnos.length > 0
                        ? "Todavía no tenés turno propio. Hasta que abras el tuyo no podés cobrar en tu caja."
                        : "No hay ningún turno abierto. Hasta que abras la caja no se puede cobrar."}
                    </p>
                  </div>
                  <AbrirCaja cajas={cajasDisponibles} />

                  {/* Con varias cajas, "no hay turno abierto" no alcanza: la
                      pregunta del cajero es cuál está libre y quién tiene la otra.
                      Sin esto, ve una lista más corta de lo que esperaba y no sabe
                      por qué. */}
                  {otrosTurnos.length > 0 && (
                    <ul className="space-y-1 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
                      {otrosTurnos.map((t) => (
                        <li key={t.caja}>
                          <strong className="font-semibold text-foreground">{t.caja}</strong> — turno
                          abierto por {t.quien}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {ultimoCierre && (
                <Card className="shadow-sm">
                  <CardContent className="space-y-2 pt-5">
                    <h3 className="rotulo-seccion">Último cierre</h3>
                    <p className="text-sm text-muted-foreground">
                      {ultimoCierre.cashRegister.name} · turno {ultimoCierre.code} · cerró{" "}
                      {ultimoCierre.closedBy?.name ?? "—"}
                      {ultimoCierre.closedAt &&
                        ` · ${formatDateTimeInTimeZone(ultimoCierre.closedAt, timeZone)}`}
                    </p>
                    <dl className="space-y-1 text-sm">
                      <Fila termino="Esperado en efectivo" valor={ultimoCierre.expectedCashCop ?? 0} />
                      <Fila termino="Contado en cajón" valor={ultimoCierre.countedCashCop ?? 0} />
                      <DiferenciaCierre valor={ultimoCierre.differenceCop ?? 0} termino="Diferencia en efectivo" />
                    </dl>
                    {/* El saldo bancario solo se muestra si el turno lo cerró con
                        él: los cierres anteriores a la columna traen null, y un
                        "$0" ahí se leería como que no entró nada por datáfono. */}
                    {ultimoCierre.expectedBankCop !== null && (
                      <dl className="space-y-1 text-sm">
                        <Fila termino="Esperado en bancos" valor={ultimoCierre.expectedBankCop} />
                        <Fila termino="Según la cuenta" valor={ultimoCierre.countedBankCop ?? 0} />
                        <DiferenciaCierre
                          valor={ultimoCierre.differenceBankCop ?? 0}
                          termino="Diferencia en bancos"
                        />
                      </dl>
                    )}
                    {ultimoCierre.notes && (
                      <p className="text-muted-foreground text-xs italic">{ultimoCierre.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          ) : (
            /* Turno abierto */
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <div className="space-y-6">
                {resumen && (
                  <>
                    {/* Los dos saldos, uno al lado del otro.
                        Hasta acá el arqueo cuadraba solo el cajón y lo cobrado con
                        datáfono se listaba abajo, "por método", sin nada contra qué
                        compararlo: la mitad de la plata de la noche sin arquear. */}
                    <div className="grid gap-4 doble:grid-cols-2">
                      <Saldo
                        titulo="Efectivo en el cajón"
                        saldo={resumen.efectivo}
                        etiquetaVentas="Ventas en efectivo"
                        etiquetaEsperado="Esperado en efectivo"
                      />
                      <Saldo
                        titulo="Cuenta de bancos"
                        saldo={resumen.bancos}
                        etiquetaVentas="Ventas con tarjeta y billeteras"
                        etiquetaEsperado="Esperado en bancos"
                      />
                    </div>

                    {/* Ni se cuenta ni se cuadra: un bono no es plata que entre.
                        Se muestra igual porque explica por qué el total del día no
                        es la suma de los dos saldos. */}
                    {/* El fiado va primero y con su propia explicación: no es un
                        medio de pago más, es plata que no entró. */}
                    {resumen.fiadoCop > 0 && (
                      <Card className="shadow-sm border-warning/40">
                        <CardContent className="space-y-1 pt-5">
                          <dl className="text-sm">
                            <Fila termino="Fiado hoy" valor={resumen.fiadoCop} />
                          </dl>
                          <p className="text-xs text-warning-soft">
                            No entra al arqueo: no hay que contarlo. Se cobra en Cartera.
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {resumen.otrosCop > 0 && (
                      <Card className="shadow-sm">
                        <CardContent className="pt-5">
                          <dl className="text-sm">
                            <Fila termino="Bonos y otros medios (no se cuadran)" valor={resumen.otrosCop} />
                          </dl>
                        </CardContent>
                      </Card>
                    )}

                    {resumen.porMetodo.length > 0 && (
                      <Card className="shadow-sm">
                        <CardContent className="space-y-3 pt-5">
                          <h3 className="rotulo-seccion">Cobros por método</h3>
                          <ul className="divide-border divide-y text-xs">
                            {resumen.porMetodo.map((metodo) => (
                              <li
                                key={metodo.method}
                                className="flex items-center justify-between gap-2 py-2 first:pt-0"
                              >
                                <span>
                                  <strong className="font-semibold">{metodo.method}</strong>
                                  <span className="text-muted-foreground ml-2 text-rotulo">
                                    ({metodo.cantidad} {metodo.cantidad === 1 ? "cobro" : "cobros"}) ·{" "}
                                    {CUENTA[metodo.cuenta] ?? metodo.cuenta}
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
                      <h3 className="rotulo-seccion">Entradas y salidas de dinero</h3>
                      <p className="text-xs text-muted-foreground">
                        Ingresos extras, pagos a proveedores, gastos menores o retiros parciales de caja.
                      </p>
                    </div>
                    <Movimiento clavePuesta={claveSalidasPuesta} />

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
                                  {TIPO[mov.type] ?? mov.type} · {CUENTA[mov.account] ?? mov.account}
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
                      <h3 className="rotulo-seccion text-destructive-soft">Cerrar turno</h3>
                      <p className="text-xs text-muted-foreground">
                        Contá el cajón y mirá el saldo de la cuenta. El turno cierra con las
                        dos cifras.
                      </p>
                      <CerrarCaja
                        esperadoCop={resumen.efectivo.esperadoCop}
                        esperadoBancoCop={resumen.bancos.esperadoCop}
                      />
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

/**
 * Un saldo del turno: de dónde salió y en cuánto tendría que estar.
 *
 * Los dos se dibujan igual a propósito. Que el cajón y el banco se lean con la
 * misma estructura es lo que hace evidente que son dos arqueos y no un arqueo con
 * un dato de color al costado.
 */
function Saldo({
  titulo,
  saldo,
  etiquetaVentas,
  etiquetaEsperado,
}: {
  titulo: string;
  saldo: SaldoProp;
  etiquetaVentas: string;
  /** La línea del total se nombra entera: es la cifra que alguien va a citar por
   *  teléfono, y "Esperado" a secas no dice de cuál de los dos saldos habla. */
  etiquetaEsperado: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-3 pt-5">
        <h3 className="rotulo-seccion">{titulo}</h3>
        <dl className="space-y-1 text-sm">
          <Fila termino="Base del turno" valor={saldo.baseCop} />
          <Fila termino={etiquetaVentas} valor={saldo.ventasCop} />
          <Fila termino="Entradas y ajustes" valor={saldo.ingresosCop} />
          <Fila termino="Gastos y retiros" valor={-saldo.egresosCop} />
          <div className="border-border flex items-baseline justify-between border-t pt-2">
            <dt className="font-bold text-sm">{etiquetaEsperado}</dt>
            <dd className="numeral text-2xl font-black text-brand dark:text-brand-accent">
              {formatCop(saldo.esperadoCop)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function DiferenciaCierre({ termino, valor }: { termino: string; valor: number }) {
  return (
    <div className="border-border flex items-baseline justify-between border-t pt-2">
      <dt className="font-semibold">{termino}</dt>
      <dd className={cn("numeral text-base font-bold", valor !== 0 && "text-destructive")}>
        {formatCop(valor)}
      </dd>
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
