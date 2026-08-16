"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { comprarSedeAdicional } from "@/features/facturacion/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";

/**
 * Comprar una sede más.
 *
 * Lo único que hay que entender antes de pagar es qué se lleva y qué va a pagar
 * el mes que viene, así que eso es lo que dice, con los dos números al lado. El
 * "pagás por lo que falta" no es un detalle contable: es la respuesta a la
 * pregunta que hace todo el mundo —"¿me van a cobrar el mes completo?"—.
 */

function Enviar({ montoCop }: { montoCop: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Llevándote a MercadoPago…" : `Pagar ${formatCop(montoCop)} y habilitar la sede`}
    </Button>
  );
}

export function SedeAdicional({
  montoCop,
  diasRestantes,
  mensualAntesCop,
  mensualDesdeAhoraCop,
  hastaCuando,
  cupoDisponible,
}: {
  montoCop: number;
  diasRestantes: number;
  mensualAntesCop: number;
  mensualDesdeAhoraCop: number;
  hastaCuando: string;
  /** Ya pagó el cupo y todavía no creó la sede. */
  cupoDisponible: boolean;
}) {
  const [estado, accion] = useActionState(comprarSedeAdicional, ESTADO_INICIAL);
  const [abierto, setAbierto] = useState(false);

  if (cupoDisponible) {
    return (
      <div className="space-y-3 rounded-lg border border-success/40 bg-success/10 p-4">
        <p className="text-sm font-semibold text-success-soft">
          Tenés una sede habilitada sin usar.
        </p>
        <p className="text-xs text-muted-foreground">
          Creala desde el selector de negocios, arriba a la izquierda, en «Cambiar».
        </p>
      </div>
    );
  }

  if (!abierto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAbierto(true)} className="w-full">
        Agregar otra sede
      </Button>
    );
  }

  return (
    <form action={accion} className="space-y-3 rounded-lg border border-[var(--linea-16)] bg-[var(--panel-2)] p-4">
      <div>
        <h3 className="font-display text-lg font-black uppercase tracking-tight text-foreground">
          Agregar otra sede
        </h3>
        <p className="text-xs text-muted-foreground">
          Cada sede tiene sus mesas, su carta, su caja y su menú QR. Se administran
          por separado y se pagan en esta misma licencia.
        </p>
      </div>

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <dl className="space-y-2 border-y border-dashed border-[var(--linea-30)] py-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            Ahora, por los {diasRestantes} días que faltan
          </dt>
          <dd className="numeral shrink-0 text-lg font-bold text-foreground">
            {formatCop(montoCop)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            Desde el <span className="numeral">{hastaCuando}</span>, tu licencia
          </dt>
          <dd className="numeral shrink-0 text-foreground">
            <span className="text-muted-foreground line-through">
              {formatCop(mensualAntesCop)}
            </span>{" "}
            <span className="font-bold">{formatCop(mensualDesdeAhoraCop)}</span>
          </dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        Pagás solo lo que falta de este período, no el mes completo.
      </p>

      <div className="flex flex-col gap-2">
        <Enviar montoCop={montoCop} />
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
          Ahora no
        </Button>
      </div>
    </form>
  );
}
