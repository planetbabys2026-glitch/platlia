"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Campo } from "@/components/formulario/campo";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { CampoTrampa } from "@/components/formulario/trampa";
import { Turnstile } from "@/components/formulario/turnstile";
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

  // El correo repetido es el único rechazo que tiene salida, así que es el único
  // que se acompaña con los dos caminos que sirven. Se detecta por el campo
  // —que la acción manda en `campos.email`— y no comparando el texto del
  // mensaje: un mensaje se reescribe y nadie se acuerda de este `if`.
  const correoRepetido = Boolean(campos?.email?.length);

  return (
    <form action={accion} className="relative space-y-4" noValidate>
      <CampoTrampa />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="animate-shake border-destructive/40 bg-destructive/15 text-destructive-soft rounded-xl">
          <AlertDescription className="space-y-3">
            <p>{estado.error}</p>
            {correoRepetido && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/ingresar"
                    className="border-destructive/40 hover:bg-destructive/20 inline-flex h-9 items-center rounded-lg border px-3 font-semibold"
                  >
                    Ingresar
                  </Link>
                  <Link
                    href="/recuperar"
                    className="border-destructive/40 hover:bg-destructive/20 inline-flex h-9 items-center rounded-lg border px-3 font-semibold"
                  >
                    Recuperar contraseña
                  </Link>
                </div>
                <p className="text-xs opacity-90">
                  ¿Vas a abrir otra sede? Entrá con tu cuenta y usá «Crear nueva sucursal»:
                  así queda bajo la misma licencia en vez de pagarse aparte.
                </p>
              </>
            )}
          </AlertDescription>
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
        requisitos
        errores={campos?.password}
      />
      {/* `registroSchema` compara este campo con el anterior. Faltaba, así que
          llegaba `undefined`, zod rechazaba el envío y el error quedaba colgado
          de un campo que nadie dibujaba: el formulario solo decía "revisá los
          datos" y no había forma de registrarse. Una clave mal tipeada acá deja
          afuera al dueño de un negocio recién creado, así que se confirma. */}
      <CampoContrasena
        label="Repetir contraseña"
        name="confirmarPassword"
        autoComplete="new-password"
        required
        errores={campos?.confirmarPassword}
      />

      <Turnstile />
      <Enviar />
    </form>
  );
}
