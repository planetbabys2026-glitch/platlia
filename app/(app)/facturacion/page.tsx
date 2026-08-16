import type { Metadata } from "next";
import { getFacturacion } from "@/features/facturacion/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireBusiness } from "@/lib/auth/dal";
import { cuentaDelPropietario } from "@/lib/billing/cuenta";
import { listaVigenteDeLaBase } from "@/lib/billing/lista";
import { prorratearSedeNueva } from "@/lib/billing/prorrateo";
import { cotizarTodas, listaParaNegocio, type Periodicidad } from "@/lib/billing/precios";
import { aplicarPagoAprobado, diasParaElCorte } from "@/lib/billing/suscripcion";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
import { BotonPagar } from "./boton-pagar";
import { CobroAutomatico } from "./cobro-automatico";
import { SedeAdicional } from "./sede-adicional";

export const metadata: Metadata = { title: "Facturación" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, { texto: string; tono: "ok" | "aviso" | "malo" }> = {
  PRUEBA: { texto: "En prueba", tono: "ok" },
  ACTIVA: { texto: "Al día", tono: "ok" },
  VENCIDA: { texto: "Vencida", tono: "aviso" },
  SUSPENDIDA: { texto: "Suspendida", tono: "malo" },
  CANCELADA: { texto: "Cancelada", tono: "malo" },
};

const ESTADO_PAGO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  REEMBOLSADO: "Reembolsado",
  CONTRACARGO: "Contracargo",
};

export default async function FacturacionPage() {
  // requireBusiness y no requireActiveLicense: si esta página exigiera licencia
  // vigente, un negocio vencido no podría entrar a pagar para dejar de estarlo.
  const ctx = await requireBusiness();
  const { suscripcion, pagos } = await getFacturacion(ctx.business.id);

  if (!suscripcion) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">Facturación</h1>
        <p className="text-muted-foreground text-sm">
          Este negocio no tiene una suscripción registrada. Escribinos y la creamos.
        </p>
      </div>
    );
  }

  const estado = ESTADO[suscripcion.status] ?? { texto: suscripcion.status, tono: "aviso" };
  const dias = diasParaElCorte(suscripcion);
  const vence = suscripcion.currentPeriodEnd ?? suscripcion.trialEndsAt;
  const zona = ctx.business.timeZone;

  // Las tres opciones y, para cada una, hasta cuándo quedaría paga si se comprara
  // hoy. Ese "hasta cuándo" es la pregunta real de quien está por renovar, y se
  // calcula con la MISMA función que usa el webhook: lo que se promete acá es
  // exactamente lo que se va a aplicar cuando entre el pago.
  // La licencia es de la CUENTA, no de esta sede: el precio depende de cuántas
  // sedes cubre y se cobra una sola vez.
  const cuenta = await cuentaDelPropietario(ctx.user.id);
  const lista = listaParaNegocio(await listaVigenteDeLaBase(), cuenta?.priceCop ?? suscripcion.priceCop);
  const sedes = cuenta?.sedes ?? 1;
  const cotizaciones = cotizarTodas(lista, sedes);
  const ahora = new Date();
  const vencimientos = Object.fromEntries(
    cotizaciones.map((c) => [
      c.periodicidad,
      formatDayInTimeZone(
        aplicarPagoAprobado(suscripcion, ahora, c.mesesOtorgados).currentPeriodEnd,
        zona,
      ),
    ]),
  ) as Record<Periodicidad, string>;

  /**
   * La compra de una sede más.
   *
   * Solo tiene sentido ofrecerla con la licencia viva y el período corriendo: con
   * la licencia vencida lo que corresponde es renovar, y ahí la sede nueva ya
   * entra en el precio del período completo.
   */
  const cupoDisponible = Boolean(cuenta && cuenta.sedes < cuenta.maxBranches);
  const puedeSumarSede = Boolean(
    cuenta &&
      cuenta.sedes < 2 &&
      cuenta.status === "ACTIVA" &&
      cuenta.currentPeriodEnd &&
      cuenta.currentPeriodEnd > ahora,
  );
  /**
   * El cobro automático. Solo se ofrece con la licencia viva: autorizar un débito
   * estando vencido cobraría en el momento, y quien está vencido primero quiere
   * ver cuánto le van a cobrar hoy, no comprometerse a un débito recurrente.
   */
  const cobroActivo = cuenta?.cobroAutomatico
    ? {
        frecuencia: cuenta.cobroAutomatico,
        montoCop: cotizaciones.find(
          (c) => c.periodicidad === (cuenta.cobroAutomatico === "ANUAL" ? "ANUAL" : "MENSUAL"),
        )!.totalCop,
        proximoCobro: cuenta.currentPeriodEnd
          ? formatDayInTimeZone(cuenta.currentPeriodEnd, zona)
          : "—",
      }
    : null;

  const mensual = cotizaciones.find((c) => c.periodicidad === "MENSUAL")!;
  const anual = cotizaciones.find((c) => c.periodicidad === "ANUAL")!;
  const opcionesDeCobro = [
    {
      frecuencia: "MENSUAL" as const,
      etiqueta: "Todos los meses",
      montoCop: mensual.totalCop,
      ahorroCop: 0,
    },
    {
      frecuencia: "ANUAL" as const,
      etiqueta: "Una vez al año",
      montoCop: anual.totalCop,
      ahorroCop: anual.ahorroCop,
    },
  ];

  const prorrateo =
    cuenta && puedeSumarSede
      ? prorratearSedeNueva({
          lista,
          sedesActuales: cuenta.sedes,
          inicioPeriodo: cuenta.currentPeriodStart,
          finPeriodo: cuenta.currentPeriodEnd,
          ahora,
        })
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">Facturación</h1>
        <p className="text-muted-foreground text-sm">
          {ctx.business.name} · {formatCop(suscripcion.priceCop)} al mes
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Estado de la licencia</h2>
            <Badge variant={estado.tono === "ok" ? "default" : "secondary"}>
              {estado.texto}
            </Badge>
          </div>

          <dl className="space-y-1 text-sm">
            {vence && (
              <div className="text-muted-foreground flex justify-between gap-2">
                <dt>{suscripcion.status === "PRUEBA" ? "La prueba termina" : "Vence"}</dt>
                <dd className="numeral">{formatDayInTimeZone(vence, zona)}</dd>
              </div>
            )}
            {suscripcion.graceUntil && (
              <div className="text-muted-foreground flex justify-between gap-2">
                <dt>Se corta el servicio</dt>
                <dd className="numeral">
                  {formatDayInTimeZone(suscripcion.graceUntil, zona)}
                </dd>
              </div>
            )}
          </dl>

          {dias !== null && (
            <p className={dias <= 3 ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
              {dias > 0
                ? `Quedan ${dias} ${dias === 1 ? "día" : "días"} de servicio.`
                : "El servicio está cortado. Renová para volver a trabajar."}
            </p>
          )}

          {suscripcion.status !== "CANCELADA" && (
            <BotonPagar
              cotizaciones={cotizaciones}
              vencimientos={vencimientos}
              sedes={sedes}
            />
          )}

          {(cobroActivo || suscripcion.status === "ACTIVA") && (
            <CobroAutomatico
              activo={cobroActivo}
              opciones={opcionesDeCobro}
              desdeCuando={
                cuenta?.currentPeriodEnd ? formatDayInTimeZone(cuenta.currentPeriodEnd, zona) : "—"
              }
            />
          )}

          {puedeSumarSede && prorrateo && (
            <SedeAdicional
              montoCop={prorrateo.montoCop}
              diasRestantes={prorrateo.diasRestantes}
              mensualAntesCop={prorrateo.mensualAntesCop}
              mensualDesdeAhoraCop={prorrateo.mensualDesdeAhoraCop}
              hastaCuando={formatDayInTimeZone(cuenta!.currentPeriodEnd!, zona)}
              cupoDisponible={cupoDisponible}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">Pagos</h2>

          {pagos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay pagos registrados.
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {pagos.map((pago) => (
                <li key={pago.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="numeral">
                      {formatDayInTimeZone(pago.paidAt ?? pago.createdAt, zona)}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {ESTADO_PAGO[pago.status] ?? pago.status}
                      {pago.periodEnd && ` · hasta ${formatDayInTimeZone(pago.periodEnd, zona)}`}
                    </span>
                  </span>
                  <span className="numeral font-medium">{formatCop(pago.amountCop)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
