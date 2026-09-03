"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ingresarSuperAdmin } from "@/features/superadmin/actions";
import { Campo } from "@/components/formulario/campo";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { CampoTrampa } from "@/components/formulario/trampa";
import { Turnstile } from "@/components/formulario/turnstile";
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
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="relative space-y-4" noValidate>
      <CampoTrampa />
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
        errores={campos?.email}
      />
      {/* Con el ojo para mostrarla, igual que el ingreso del producto: acá era un
          campo pelado, así que quien da soporte tecleaba a ciegas una contraseña
          de 12 caracteres con símbolos y no tenía cómo revisarla antes de
          mandarla. Sin `requisitos`: esto verifica contra un hash que ya existe,
          no se está eligiendo una contraseña nueva. */}
      <CampoContrasena
        label="Contraseña"
        name="password"
        autoComplete="current-password"
        required
        errores={campos?.password}
      />
      <Turnstile />
      <Enviar />
    </form>
  );
}
