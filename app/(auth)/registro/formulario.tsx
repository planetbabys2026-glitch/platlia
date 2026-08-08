"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/formulario/campo";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { registrarse } from "@/features/auth/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full bg-[var(--brasa)] text-[var(--tinta)] hover:bg-[var(--brasa-hover)] font-bold text-base h-12 shadow-lg shadow-[var(--brasa)]/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
      disabled={pending}
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Creando tu restaurante…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Sparkles className="size-4" />
          Empezar los 7 días gratis
          <ArrowRight className="size-4" />
        </span>
      )}
    </Button>
  );
}

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrarse, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="space-y-4" noValidate>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="animate-shake border-destructive/40 bg-destructive/15 text-rose-300 rounded-xl">
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
        label="Correo electrónico"
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

      <Enviar />
    </form>
  );
}
