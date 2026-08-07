import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { getSuperAdmin } from "@/lib/auth/dal";
import { ArrowLeft } from "lucide-react";
import { FormularioSuperAdmin } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };
export const dynamic = "force-dynamic";

export default async function IngresarSuperAdminPage() {
  const superAdmin = await getSuperAdmin();
  if (superAdmin) {
    redirect("/superadmin");
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      {/* Botón explícito para regresar a la página principal */}
      <div className="w-full max-w-sm flex items-center justify-start">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Link href="/" aria-label="Volver a la página principal">
            <ArrowLeft className="size-4" />
            <span>Volver a la página principal</span>
          </Link>
        </Button>
      </div>

      <Link href="/" aria-label="Ir al inicio" className="transition-opacity hover:opacity-90">
        <Logotipo priority className="h-11" />
      </Link>

      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Superadministración</h1>
          <p className="text-muted-foreground text-sm">
            Consola de soporte de Platlia. No es el ingreso de los negocios.
          </p>
        </div>
        <FormularioSuperAdmin />
      </div>
    </div>
  );
}
