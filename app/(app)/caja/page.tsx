import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import {
  getCajaAbierta,
  getCuentasPorCobrar,
  getMovimientos,
  getResumenCaja,
  getUltimoCierre,
} from "@/features/caja/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import { currentBusinessDate, formatDateTimeInTimeZone } from "@/lib/time";
import { PanelCaja } from "./panel-caja";

export const metadata: Metadata = { title: "Caja" };
export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const ctx = await requireModule(AppModule.CAJA);
  const settings = await getSettings(ctx.business.id);
  const businessDate = currentBusinessDate(settings);
  const caja = await getCajaAbierta(ctx.business.id);
  const usaMesas = ctx.modules.has(AppModule.MESAS);

  let ultimoCierre = null;
  let resumen = null;
  let movimientos: Awaited<ReturnType<typeof getMovimientos>> = [];
  let cuentas: Awaited<ReturnType<typeof getCuentasPorCobrar>> = [];

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
          <h1 className="text-3xl font-semibold tracking-tight">
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
        usaMesas={usaMesas}
        timeZone={ctx.business.timeZone}
      />
    </div>
  );
}
