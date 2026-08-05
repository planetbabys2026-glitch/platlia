"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { reenviarVerificacion } from "@/features/auth/actions";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-primary text-sm font-medium hover:underline disabled:opacity-50"
    >
      {pending ? "Enviando…" : "Reenviar correo"}
    </button>
  );
}

/**
 * Aviso de correo sin confirmar.
 *
 * Sin esto, nadie se entera de que su método de recuperación está roto hasta el
 * día que lo necesita —que es justo el día en que ya no puede entrar a
 * corregirlo—. Desaparece solo, como el de la licencia en gracia: cuando el
 * correo se confirma, `ctx.user.emailVerifiedAt` deja de ser null y esta tarjeta
 * ya no se pinta.
 */
export function AvisoCorreoSinVerificar({ email }: { email: string }) {
  const [estado, accion] = useActionState(reenviarVerificacion, ESTADO_INICIAL);

  return (
    <Card className="border-warning">
      <CardContent className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-warning text-base">Confirmá tu correo</CardTitle>
          <CardDescription>
            Todavía no confirmaste {email}. Sin confirmarlo, si algún día olvidás la
            contraseña no vamos a poder mandarte cómo recuperarla.
          </CardDescription>
        </div>
        {estado.ok ? (
          <p className="text-muted-foreground text-sm">{estado.data.mensaje}</p>
        ) : (
          <form action={accion}>
            {estado.error && <p className="text-destructive text-xs">{estado.error}</p>}
            <Enviar />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
