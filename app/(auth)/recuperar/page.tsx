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
        <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-[var(--papel)] leading-[0.95]">
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
