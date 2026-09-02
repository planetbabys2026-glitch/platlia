"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightLeft } from "lucide-react";
import { trasladarPedido } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

/**
 * Mudar una cuenta a otra mesa.
 *
 * Se despliega en vez de abrir un diálogo: es una acción de dos toques que el
 * mesero hace parado al lado de la mesa, con una mano, y un modal a pantalla
 * completa en un teléfono tapa justamente la mesa que está mirando.
 *
 * Las mesas ocupadas se ofrecen igual y se dice que lo están. Mandar una cuenta a
 * una mesa con gente es legítimo —el modelo admite varias cuentas por mesa— y es
 * lo que pasa cuando dos grupos se juntan; esconderlas obligaría a liberar una
 * mesa antes de poder mudar nada.
 */
export function TrasladarCuenta({
  orderId,
  mesas,
  etiqueta,
}: {
  orderId: string;
  mesas: { id: string; name: string; area: string | null; cuentas: number }[];
  /** Cómo se llama la cuenta en la pantalla, para que el botón diga cuál mueve. */
  etiqueta?: string;
}) {
  const [estado, accion] = useActionState(trasladarPedido, ESTADO_INICIAL);
  const [abierto, setAbierto] = useState(false);

  if (mesas.length === 0) return null;

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        <ArrowRightLeft className="size-4" />
        Trasladar{etiqueta ? ` ${etiqueta}` : ""}
      </Button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-2 rounded-xl border border-border/80 p-3">
      <input type="hidden" name="orderId" value={orderId} />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Label htmlFor={`destino-${orderId}`}>¿A qué mesa se pasa?</Label>
      <select
        id={`destino-${orderId}`}
        name="tableIdDestino"
        required
        className="h-11 tableta:h-10 w-full rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
      >
        {mesas.map((mesa) => (
          <option key={mesa.id} value={mesa.id}>
            {mesa.area ? `${mesa.area} · ` : ""}
            {mesa.name}
            {mesa.cuentas > 0
              ? ` (ocupada, ${mesa.cuentas} ${mesa.cuentas === 1 ? "cuenta" : "cuentas"})`
              : ""}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2">
        <Mover />
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Mover() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Moviendo…" : "Mover la cuenta"}
    </Button>
  );
}
