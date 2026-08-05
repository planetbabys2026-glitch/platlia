"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { restablecerContrasena } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Guardando…" : "Guardar contraseña"}
    </Button>
  );
}

export function FormularioRestablecer({ token }: { token: string }) {
  const [estado, accion] = useActionState(restablecerContrasena, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <CampoContrasena
        label="Contraseña nueva"
        name="password"
        autoComplete="new-password"
        required
        autoFocus
        ayuda="Mínimo 8 caracteres."
        errores={campos?.password}
      />
      <CampoContrasena
        label="Repetir contraseña"
        name="confirmarPassword"
        autoComplete="new-password"
        required
        errores={campos?.confirmarPassword}
      />

      <Enviar />
    </form>
  );
}
