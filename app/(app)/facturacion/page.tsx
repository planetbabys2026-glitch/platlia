import type { Metadata } from "next";
import { getFacturacion } from "@/features/facturacion/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireBusiness } from "@/lib/auth/dal";
import { diasParaElCorte } from "@/lib/billing/suscripcion";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
import { BotonPagar } from "./boton-pagar";

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
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
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
            <BotonPagar precioCop={suscripcion.priceCop} />
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
