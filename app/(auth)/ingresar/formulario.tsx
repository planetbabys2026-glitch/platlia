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
import { ArrowRight, Loader2 } from "lucide-react";

function Enviar({ children }: { children: React.ReactNode }) {
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
          Verificando credenciales…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {children}
          <ArrowRight className="size-4" />
        </span>
      )}
    </Button>
  );
}

export function FormularioIngreso({ desde }: { desde?: string }) {
  const [estado, accion] = useActionState(ingresar, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {desde && <input type="hidden" name="desde" value={desde} />}

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="animate-shake border-destructive/40 bg-destructive/15 text-destructive-soft rounded-xl">
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
        <p className="text-right text-xs pt-1">
          <Link href="/recuperar" className="text-[var(--linea)] hover:text-[var(--papel)] transition-colors">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </div>

      <Enviar>Ingresar al panel</Enviar>
    </form>
  );
}
