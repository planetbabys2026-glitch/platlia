"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  activarCobroAutomatico,
  cancelarCobroAutomatico,
} from "@/features/facturacion/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Cobro automático: encenderlo y apagarlo.
 *
 * Lo que hace que alguien se anime a activarlo es saber cómo se sale, así que el
 * botón de cancelar está a la vista desde el primer momento y dice exactamente
 * qué pasa al usarlo: **se deja de cobrar, y lo que ya pagaste lo usás igual**.
 * Esconder la salida es lo que hace que la gente no entre.
 */

type Frecuencia = "MENSUAL" | "ANUAL";

function Enviar({ children, variant }: { children: string; variant?: "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="w-full">
      {pending ? "Un momento…" : children}
    </Button>
  );
}

function Activo({
  frecuencia,
  montoCop,
  proximoCobro,
}: {
  frecuencia: string;
  montoCop: number;
  proximoCobro: string;
}) {
  const [estado, accion] = useActionState(cancelarCobroAutomatico, ESTADO_INICIAL);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-success/40 bg-success/10 p-4">
      <div>
        <h3 className="font-display text-lg font-black uppercase tracking-tight text-success-soft">
          Cobro automático activo
        </h3>
        <p className="text-sm text-muted-foreground">
          Se te cobra{" "}
          <span className="numeral font-bold text-foreground">{formatCop(montoCop)}</span>{" "}
          {frecuencia === "ANUAL" ? "una vez al año" : "cada mes"}. El próximo es el{" "}
          <span className="numeral text-foreground">{proximoCobro}</span>.
        </p>
      </div>

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {confirmando ? (
        <form action={accion} className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Dejamos de cobrarte. Tu licencia sigue andando hasta el{" "}
            <span className="numeral text-foreground">{proximoCobro}</span>, que es
            hasta donde ya pagaste. Después la renovás cuando quieras.
          </p>
          <Enviar variant="outline">Sí, dejar de cobrar</Enviar>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setConfirmando(false)}>
            Seguir con el cobro automático
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Cancelar el cobro automático
        </button>
      )}
    </div>
  );
}

function Apagado({
  opciones,
  desdeCuando,
}: {
  opciones: { frecuencia: Frecuencia; etiqueta: string; montoCop: number; ahorroCop: number }[];
  desdeCuando: string;
}) {
  const [estado, accion] = useActionState(activarCobroAutomatico, ESTADO_INICIAL);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("MENSUAL");
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setAbierto(true)}>
        Que se cobre solo
      </Button>
    );
  }

  return (
    <form
      action={accion}
      className="space-y-3 rounded-lg border border-[var(--linea-16)] bg-[var(--panel-2)] p-4"
    >
      <input type="hidden" name="frecuencia" value={frecuencia} />

      <div>
        <h3 className="font-display text-lg font-black uppercase tracking-tight text-foreground">
          Que se cobre solo
        </h3>
        <p className="text-xs text-muted-foreground">
          Autorizás el débito una vez y no tenés que volver a entrar a pagar. Lo
          cancelás cuando quieras, desde acá mismo.
        </p>
      </div>

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {opciones.map((o) => (
          <button
            key={o.frecuencia}
            type="button"
            onClick={() => setFrecuencia(o.frecuencia)}
            aria-pressed={frecuencia === o.frecuencia}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
              frecuencia === o.frecuencia
                ? "border-brand bg-brand/10"
                : "border-[var(--linea-16)] hover:border-[var(--linea-30)]",
            )}
          >
            <span>
              <span className="block font-semibold text-foreground">{o.etiqueta}</span>
              {o.ahorroCop > 0 && (
                <span className="numeral block text-xs text-success-soft">
                  ahorrás {formatCop(o.ahorroCop)} por año
                </span>
              )}
            </span>
            <span className="numeral shrink-0 font-bold text-foreground">
              {formatCop(o.montoCop)}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        El primer cobro es el <span className="numeral text-foreground">{desdeCuando}</span>,
        cuando se termina lo que ya pagaste. No se cobra nada hoy.
      </p>

      <Enviar>Autorizar en MercadoPago</Enviar>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setAbierto(false)}>
        Ahora no
      </Button>
    </form>
  );
}

export function CobroAutomatico(props: {
  activo: { frecuencia: string; montoCop: number; proximoCobro: string } | null;
  opciones: { frecuencia: Frecuencia; etiqueta: string; montoCop: number; ahorroCop: number }[];
  desdeCuando: string;
}) {
  return props.activo ? (
    <Activo {...props.activo} />
  ) : (
    <Apagado opciones={props.opciones} desdeCuando={props.desdeCuando} />
  );
}
