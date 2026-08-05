"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
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
      <div className="space-y-1">
        <CampoContrasena
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          required
          errores={!estado.ok ? estado.campos?.password : undefined}
        />
        <p className="text-right text-sm">
          <Link href="/recuperar" className="text-muted-foreground hover:text-foreground">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </div>

      <Enviar>Ingresar</Enviar>
    </form>
  );
}
