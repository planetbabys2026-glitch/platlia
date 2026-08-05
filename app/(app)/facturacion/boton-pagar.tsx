"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { pagarSuscripcion } from "@/features/facturacion/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";

function Enviar({ precioCop }: { precioCop: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Llevándote a MercadoPago…" : `Pagar ${formatCop(precioCop)}`}
    </Button>
  );
}

export function BotonPagar({ precioCop }: { precioCop: number }) {
  const [estado, accion] = useActionState(pagarSuscripcion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Enviar precioCop={precioCop} />

      <p className="text-muted-foreground text-center text-xs">
        El pago se hace en MercadoPago. Platlia nunca ve ni guarda los datos de tu tarjeta.
      </p>
    </form>
  );
}
