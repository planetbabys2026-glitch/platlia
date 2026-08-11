import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { FormularioRegistro } from "./formulario";

export const metadata: Metadata = { title: "Crea tu negocio · Platlia" };

export default async function RegistroPage() {
  const sesion = await readSession("APP");
  if (sesion) {
    redirect("/panel");
  }
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--linea)]">
          — Alta de nuevo restaurante
        </p>
        <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-[var(--papel)] leading-[0.95]">
          Crear negocio
        </h1>
        <p className="text-[var(--linea)] text-sm">
          7 días de prueba gratis. Sin ingresar tarjeta y con todos los módulos desbloqueados.
        </p>
      </div>

      <FormularioRegistro />

      <div className="pt-4 border-t border-dashed border-[var(--linea-30)] text-center text-sm text-[var(--linea)]">
        ¿Ya tienes una cuenta registrada?{" "}
        <Link href="/ingresar" className="text-[var(--papel)] font-bold underline underline-offset-4 hover:text-[var(--brasa)] transition-colors">
          Ingresar aquí
        </Link>
      </div>
    </div>
  );
}
