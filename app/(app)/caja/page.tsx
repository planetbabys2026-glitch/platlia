import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import {
  getCajaAbierta,
  getCuentasCobradas,
  getCuentasPorCobrar,
  getMovimientos,
  getResumenCaja,
  getUltimoCierre,
  TOPE_CUENTAS_COBRADAS,
} from "@/features/caja/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { tenantDb } from "@/lib/db/tenant";
import {
  currentBusinessDate,
  formatDateTimeInTimeZone,
  parseBusinessDate,
} from "@/lib/time";
import { PanelCaja } from "./panel-caja";

export const metadata: Metadata = { title: "Caja" };
export const dynamic = "force-dynamic";

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; jornada?: string }>;
}) {
  const ctx = await requireModule(AppModule.CAJA);
  const { jornada } = await searchParams;
  const settings = await getSettings(ctx.business.id);
  const businessDate = currentBusinessDate(settings);
  const caja = await getCajaAbierta(ctx.business.id);
  const usaMesas = ctx.modules.has(AppModule.MESAS);
  // Un booleano, no la configuración: nada de lo fiscal tiene por qué cruzar al
  // navegador.
  const puedeFacturar = puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada());

  /**
   * La jornada que se está mirando en el historial de cobros.
   *
   * Solo afecta a esa sección: el arqueo y los movimientos son siempre del turno
   * abierto ahora. Una fecha inválida en la URL cae en la jornada en curso en vez
   * de reventar, igual que en Informes.
   */
  let diaHistorial: Date;
  try {
    diaHistorial = jornada ? parseBusinessDate(jornada) : businessDate;
  } catch {
    diaHistorial = businessDate;
  }

  let ultimoCierre = null;
  let resumen = null;
  let movimientos: Awaited<ReturnType<typeof getMovimientos>> = [];
  let cuentas: Awaited<ReturnType<typeof getCuentasPorCobrar>> = [];

  // El historial no depende de que haya caja abierta: reimprimir la tirilla de
  // anoche tiene que funcionar con el turno cerrado.
  const cobradas = await getCuentasCobradas(ctx.business.id, diaHistorial);

  if (!caja) {
    ultimoCierre = await getUltimoCierre(ctx.business.id);
  } else {
    const db = tenantDb(ctx.business.id);
    const [resData, movData, cuentasData] = await Promise.all([
      getResumenCaja(db, caja.id),
      getMovimientos(ctx.business.id, caja.id),
      usaMesas ? getCuentasPorCobrar(ctx.business.id, businessDate) : Promise.resolve([]),
    ]);
    resumen = resData;
    movimientos = movData;
    cuentas = cuentasData;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">
            {caja ? `Caja ${caja.code}` : "Caja"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {caja
              ? `Abierta por ${caja.openedBy.name} · ${formatDateTimeInTimeZone(caja.openedAt, ctx.business.timeZone)}`
              : "Control de arqueo, movimientos de efectivo y cobro de cuentas."}
          </p>
        </div>
      </div>

      <PanelCaja
        caja={caja}
        ultimoCierre={ultimoCierre}
        resumen={resumen}
        movimientos={movimientos}
        cuentas={cuentas}
        cobradas={cobradas.pedidos}
        cobradasTotal={cobradas.total}
        cobradasTope={TOPE_CUENTAS_COBRADAS}
        jornada={diaHistorial}
        esHoy={diaHistorial.getTime() === businessDate.getTime()}
        puedeFacturar={puedeFacturar}
        propina={{
          habilitada: settings.tipSuggestionEnabled,
          rateBp: settings.tipSuggestionRateBp,
        }}
        usaMesas={usaMesas}
        timeZone={ctx.business.timeZone}
      />
    </div>
  );
}
