import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppModule } from "@/generated/prisma/enums";
import {
  getCajasDisponibles,
  getCuentasCobradas,
  getCuentasPorCobrar,
  getMovimientos,
  getResumenCaja,
  getSesionDeTrabajo,
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

  /**
   * El turno que esta persona opera, no "el" turno del negocio.
   *
   * Con varias cajas abiertas, mostrarle a cada quien la primera que devolviera
   * la base sería mostrarle el arqueo de otra persona: la cifra contra la que
   * después cuenta su propio cajón. `getSesionDeTrabajo` usa la misma regla que
   * el cobro, que es lo que garantiza que el arqueo que se mira y el cajón donde
   * cae la plata sean el mismo.
   */
  const { sesion: caja, abiertas } = await getSesionDeTrabajo(ctx.business.id, ctx.user.id);
  const cajasDisponibles = await getCajasDisponibles(ctx.business.id);
  // Los turnos de los demás, para que el cajero sepa por qué su caja no está libre.
  const otrosTurnos = abiertas
    .filter((s) => s.id !== caja?.id)
    .map((s) => ({ caja: s.cashRegister.name, quien: s.openedBy.name }));
  // Un booleano, no la configuración: nada de lo fiscal tiene por qué cruzar al
  // navegador.
  const puedeFacturar = puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada());
  // Un booleano, nunca el hash: la clave de salidas no tiene por qué cruzar al
  // navegador, ni siquiera hasheada.
  const claveSalidasPuesta = Boolean(settings.expensePinHash);

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
        titulo={caja ? caja.cashRegister.name : "Caja"}
        descripcion={
          caja
            ? `Turno ${caja.code} · abierto por ${caja.openedBy.name} · ${formatDateTimeInTimeZone(caja.openedAt, ctx.business.timeZone)}`
            : "Control de arqueo, movimientos de efectivo y cobro de cuentas."
        }
      />

      <PanelCaja
        caja={caja}
        cajasDisponibles={cajasDisponibles}
        otrosTurnos={otrosTurnos}
        ultimoCierre={ultimoCierre}
        resumen={resumen}
        movimientos={movimientos}
        claveSalidasPuesta={claveSalidasPuesta}
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
