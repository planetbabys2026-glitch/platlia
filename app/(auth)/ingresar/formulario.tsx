"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ingresar } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar({ children }: { children: React.ReactNode }) {
  // useFormStatus solo funciona dentro del <form>, en un componente aparte.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Un momento…" : children}
    </Button>
  );
}

export function FormularioIngreso({ desde }: { desde?: string }) {
  const [estado, accion] = useActionState(ingresar, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {desde && <input type="hidden" name="desde" value={desde} />}

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Campo
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        errores={!estado.ok ? estado.campos?.email : undefined}
      />
      <Campo
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errores={!estado.ok ? estado.campos?.password : undefined}
      />

      <Enviar>Ingresar</Enviar>
    </form>
  );
}
