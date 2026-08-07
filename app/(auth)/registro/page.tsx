import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { FormularioRegistro } from "./formulario";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegistroPage() {
  const sesion = await readSession("APP");
  if (sesion) {
    redirect("/panel");
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Creá tu negocio</h1>
        <p className="text-muted-foreground text-sm">
          7 días gratis. Sin tarjeta y sin límite de usuarios ni de mesas.
        </p>
      </div>

      <FormularioRegistro />

      <p className="text-muted-foreground text-center text-sm">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="text-primary font-medium hover:underline">
          Ingresá
        </Link>
      </p>
    </div>
  );
}
