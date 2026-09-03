"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { CampoTrampa } from "@/components/formulario/trampa";
import { Turnstile } from "@/components/formulario/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { solicitarRecuperacion } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Enviando…" : "Mandar instrucciones"}
    </Button>
  );
}

export function FormularioRecuperar() {
  const [estado, accion] = useActionState(solicitarRecuperacion, ESTADO_INICIAL);

  if (estado.ok) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>{estado.data.mensaje}</AlertDescription>
        </Alert>
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/ingresar" className="text-primary font-medium hover:underline">
            Volver a ingresar
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="relative space-y-4" noValidate>
      <CampoTrampa />
      {estado.error && (
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
        errores={estado.campos?.email}
      />

      <Turnstile />
      <Enviar />
    </form>
  );
}
