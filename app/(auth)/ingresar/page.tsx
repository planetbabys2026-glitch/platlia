import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { readSession } from "@/lib/auth/session";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Entrar al piso · Platlia" };

// En Next 15 searchParams es una Promise y hay que esperarla.
export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; restablecida?: string }>;
}) {
  const { desde, restablecida } = await searchParams;

  // Si ya cuenta con una sesión real activa en base de datos, redirigir al panel
  const sesion = await readSession("APP");
  if (sesion && !desde && !restablecida) {
    redirect("/panel");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--linea)]">
          — Ingreso de usuarios
        </p>
        <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-[var(--papel)] leading-[0.95]">
          Entrar al piso
        </h1>
        <p className="text-[var(--linea)] text-sm">
          Accede con el correo y contraseña de tu cuenta registrada.
        </p>
      </div>

      {restablecida && (
        <Alert className="border-[var(--brasa)]/40 bg-[var(--brasa)]/15 text-[var(--brasa)]">
          <AlertDescription>
            Tu contraseña quedó cambiada. Entrá con la nueva.
          </AlertDescription>
        </Alert>
      )}

      <FormularioIngreso desde={desde} />

      <div className="pt-4 border-t border-dashed border-[var(--linea-30)] text-center text-sm text-[var(--linea)]">
        ¿Todavía no tienes cuenta?{" "}
        <Link href="/registro" className="text-[var(--papel)] font-bold underline underline-offset-4 hover:text-[var(--brasa)] transition-colors">
          Comenzar prueba gratis 7 días
        </Link>
      </div>
    </div>
  );
}
