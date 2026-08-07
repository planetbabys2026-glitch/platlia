"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
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
        label="Nombre del negocio o primera sucursal"
        name="nombreNegocio"
        autoComplete="organization"
        required
        ayuda="Nombre comercial o sede principal (ej. Saja - Poblado). Podrás agregar más sucursales después."
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
      <CampoContrasena
        label="Contraseña"
        name="password"
        autoComplete="new-password"
        required
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
