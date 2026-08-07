import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { readSession } from "@/lib/auth/session";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

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
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Ingresá a tu negocio</h1>
        <p className="text-muted-foreground text-sm">
          Con el correo y la contraseña de tu cuenta.
        </p>
      </div>

      {restablecida && (
        <Alert>
          <AlertDescription>
            Tu contraseña quedó cambiada. Entrá con la nueva.
          </AlertDescription>
        </Alert>
      )}

      <FormularioIngreso desde={desde} />

      <p className="text-muted-foreground text-center text-sm">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/registro" className="text-primary font-medium hover:underline">
          Creá una gratis
        </Link>
      </p>
    </div>
  );
}
