"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { pagarSuscripcion } from "@/features/facturacion/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import type { Cotizacion, Periodicidad } from "@/lib/billing/precios";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

/**
 * Elegir cuánto tiempo se compra (1 mes, 6 meses o 12 meses) y pagar vía Mercado Pago Pro.
 */

function Enviar({ cotizacion }: { cotizacion: Cotizacion }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full font-bold shadow-md shadow-brand/20">
      <ExternalLink className="mr-2 size-4" />
      {pending ? "Llevándote a Mercado Pago…" : `Pagar en Mercado Pago (${formatCop(cotizacion.totalCop)})`}
    </Button>
  );
}

function Opcion({
  cotizacion,
  elegida,
  onElegir,
  hasta,
}: {
  cotizacion: Cotizacion;
  elegida: boolean;
  onElegir: () => void;
  hasta: string;
}) {
  const { periodicidad, mesesOtorgados, totalCop, mensualEquivalenteCop, ahorroCop } = cotizacion;

  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegida}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left transition-colors",
        elegida
          ? "border-brand bg-brand/10"
          : "border-[var(--linea-16)] bg-[var(--panel)] hover:border-[var(--linea-30)]",
      )}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-black uppercase tracking-tight text-foreground">
            {mesesOtorgados} {mesesOtorgados === 1 ? "mes" : "meses"}
          </span>
          {ahorroCop > 0 && (
            <span className="rounded-full bg-success/20 px-2 py-0.5 text-rotulo font-bold uppercase text-success-soft">
              {cotizacion.mesesGratis} {cotizacion.mesesGratis === 1 ? "mes gratis" : "meses gratis"}
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Te queda paga hasta el <span className="numeral text-foreground">{hasta}</span>
          {periodicidad !== "MENSUAL" && (
            <> · sale {formatCop(mensualEquivalenteCop)} el mes</>
          )}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="numeral block text-lg font-bold text-foreground">
          {formatCop(totalCop)}
        </span>
        {ahorroCop > 0 && (
          <span className="numeral block text-xs text-success-soft">
            ahorrás {formatCop(ahorroCop)}
          </span>
        )}
      </span>
    </button>
  );
}

export function BotonPagar({
  cotizaciones,
  vencimientos,
  sedes,
}: {
  cotizaciones: Cotizacion[];
  /** Hasta qué día queda la licencia con cada opción, ya formateado en el servidor. */
  vencimientos: Record<Periodicidad, string>;
  sedes: number;
}) {
  const [estado, accion] = useActionState(pagarSuscripcion, ESTADO_INICIAL);
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>("MENSUAL");

  const elegida = cotizaciones.find((c) => c.periodicidad === periodicidad) ?? cotizaciones[0];

  return (
    <div className="space-y-4">
      {/* Selector de periodicidad */}
      <div className="space-y-2">
        {cotizaciones.map((c) => (
          <Opcion
            key={c.periodicidad}
            cotizacion={c}
            elegida={c.periodicidad === periodicidad}
            onElegir={() => {
              setPeriodicidad(c.periodicidad);
            }}
            hasta={vencimientos[c.periodicidad]}
          />
        ))}
      </div>

      {sedes > 1 && (
        <p className="text-xs text-muted-foreground">
          El precio cubre tus {sedes} sedes.
        </p>
      )}

      <form action={accion} className="space-y-3">
        <input type="hidden" name="periodicidad" value={periodicidad} />

        {!estado.ok && estado.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{estado.error}</AlertDescription>
          </Alert>
        )}

        <Enviar cotizacion={elegida} />

        <p className="text-center text-xs text-muted-foreground">
          Al hacer clic, serás redirigido a Mercado Pago para completar tu pago de forma 100% segura.
        </p>
      </form>
    </div>
  );
}
