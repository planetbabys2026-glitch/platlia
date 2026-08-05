import type { Metadata } from "next";
import { FormularioRecuperar } from "./formulario";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">¿Olvidaste tu contraseña?</h1>
        <p className="text-muted-foreground text-sm">
          Escribí el correo con el que te registraste y te mandamos cómo elegir una
          nueva.
        </p>
      </div>

      <FormularioRecuperar />
    </div>
  );
}
