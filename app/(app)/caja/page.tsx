import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
import { EncabezadoPantalla } from "@/components/marca/pantalla";
import { requireModule } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
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
  const settings = await getSettings(ctx.business.id);
  if (!tienePermisoSeccion(ctx.role, "caja", settings.rolePermissions)) {
    notFound();
  }
  const { jornada } = await searchParams;
  const businessDate = currentBusinessDate(settings);
  const caja = await getCajaAbierta(ctx.business.id);
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
      getCuentasPorCobrar(ctx.business.id, businessDate),
    ]);
    resumen = resData;
    movimientos = movData;
    cuentas = cuentasData;
  }

  return (
    <div className="space-y-6">
      {/* El encabezado del sistema, como el salón y el POS: era el `h1` copiado
          a mano con su propio clamp, y sin la guía punteada que cierra el bloque
          en todas las demás pantallas. */}
      <EncabezadoPantalla
        titulo={caja ? `Caja ${caja.code}` : "Caja"}
        descripcion={
          caja
            ? `Abierta por ${caja.openedBy.name} · ${formatDateTimeInTimeZone(caja.openedAt, ctx.business.timeZone)}`
            : "Control de arqueo, movimientos de efectivo y cobro de cuentas."
        }
      />

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
        domiciliosQr={
          settings.deliveryEnabled ? { abierto: settings.qrDeliveryEnabled } : null
        }
        timeZone={ctx.business.timeZone}
      />
    </div>
  );
}
