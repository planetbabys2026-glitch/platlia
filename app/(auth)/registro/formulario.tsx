"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { registrarse } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creando tu negocio…" : "Empezar los 7 días gratis"}
    </Button>
  );
}

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrarse, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="space-y-4" noValidate>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Campo
        label="Tu nombre"
        name="name"
        autoComplete="name"
        autoFocus
        required
        errores={campos?.name}
      />
      <Campo
        label="Nombre del negocio"
        name="nombreNegocio"
        autoComplete="organization"
        required
        ayuda="El que va impreso en el tiquete. Se puede cambiar después."
        errores={campos?.nombreNegocio}
      />
      <Campo
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        required
        errores={campos?.email}
      />
      <Campo
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        ayuda="Mínimo 8 caracteres."
        errores={campos?.password}
      />

      <Enviar />
    </form>
  );
}
