"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { elegirNegocio } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

export type NegocioElegible = {
  id: string;
  name: string;
  role: string;
  activo: boolean;
};

function Opcion({ negocio }: { negocio: NegocioElegible }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name="businessId"
      value={negocio.id}
      variant="outline"
      className="h-auto w-full justify-between py-3"
      disabled={pending || !negocio.activo}
    >
      <span className="font-medium">{negocio.name}</span>
      <span className="text-muted-foreground text-xs font-normal">
        {negocio.activo ? negocio.role.toLowerCase() : "suspendido"}
      </span>
    </Button>
  );
}

export function SelectorNegocio({ negocios }: { negocios: NegocioElegible[] }) {
  const [estado, accion] = useActionState(elegirNegocio, ESTADO_INICIAL);

  return (
    <div className="space-y-3">
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {/* Un formulario por negocio: el botón lleva el businessId en su `value`,
          así el envío dice cuál se apretó sin JavaScript de por medio. */}
      <ul className="space-y-2">
        {negocios.map((negocio) => (
          <li key={negocio.id}>
            <form action={accion}>
              <Opcion negocio={negocio} />
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
