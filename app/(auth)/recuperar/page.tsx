import type { Metadata } from "next";
import { FormularioRecuperar } from "./formulario";

export const metadata: Metadata = { title: "Recuperar contraseña · Platlia" };

export default function RecuperarPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--linea)]">
          — Seguridad de la cuenta
        </p>
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">
          Recuperar contraseña
        </h1>
        <p className="text-[var(--linea)] text-sm">
          Ingresa el correo registrado y te enviaremos las instrucciones de recuperación.
        </p>
      </div>

      <FormularioRecuperar />
    </div>
  );
}
