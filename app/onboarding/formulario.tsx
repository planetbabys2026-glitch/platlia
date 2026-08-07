"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { crearNegocioPropio } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creando…" : "Crear negocio"}
    </Button>
  );
}

export function FormularioNegocio() {
  const [estado, accion] = useActionState(crearNegocioPropio, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Campo
        label="Nombre del negocio o primera sucursal"
        name="nombreNegocio"
        autoComplete="organization"
        autoFocus
        required
        ayuda="Nombre comercial o sede principal (ej. Saja - Poblado). Podrás agregar más sucursales después."
        errores={!estado.ok ? estado.campos?.nombreNegocio : undefined}
      />

      <Enviar />
    </form>
  );
}
