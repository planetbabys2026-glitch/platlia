"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ingresarSuperAdmin } from "@/features/superadmin/actions";
import { Campo } from "@/components/formulario/campo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Un momento…" : "Entrar"}
    </Button>
  );
}

export function FormularioSuperAdmin() {
  const [estado, accion] = useActionState(ingresarSuperAdmin, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      <Campo label="Correo" name="email" type="email" autoComplete="email" autoFocus required />
      <Campo
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Enviar />
    </form>
  );
}
