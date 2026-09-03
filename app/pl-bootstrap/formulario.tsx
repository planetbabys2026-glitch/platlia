"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { crearSuperAdmin } from "@/features/superadmin/actions";
import { Campo } from "@/components/formulario/campo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { LARGO_MINIMO_SUPERADMIN } from "@/lib/auth/reglas-contrasena";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creando…" : "Crear superadministrador"}
    </Button>
  );
}

export function FormularioBootstrap() {
  const [estado, accion] = useActionState(crearSuperAdmin, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="space-y-4" noValidate>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Campo
        label="Token de bootstrap"
        name="token"
        type="password"
        autoFocus
        required
        ayuda="El valor de SUPERADMIN_BOOTSTRAP_TOKEN."
        errores={campos?.token}
      />
      <Campo label="Nombre" name="name" required errores={campos?.name} />
      <Campo label="Correo" name="email" type="email" required errores={campos?.email} />
      <CampoContrasena
        label="Contraseña"
        name="password"
        required
        requisitos
        largoMinimo={LARGO_MINIMO_SUPERADMIN}
        ayuda="Esta cuenta ve todos los negocios, por eso pide más largo."
        errores={campos?.password}
      />

      <Enviar />
    </form>
  );
}

