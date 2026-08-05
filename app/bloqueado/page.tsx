import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { salir } from "@/features/auth/actions";
import { requireBusiness } from "@/lib/auth/dal";
import { formatCop } from "@/lib/money";

export const metadata: Metadata = { title: "Licencia vencida" };
export const dynamic = "force-dynamic";

/**
 * Pantalla de licencia vencida.
 *
 * Verifica por su cuenta, igual que cualquier otra: si la licencia SÍ está
 * vigente, no hay nada que mostrar acá y devuelve al panel. Sin ese chequeo, la
 * pantalla quedaría accesible para siempre y confundiría a quien ya pagó.
 */
export default async function BloqueadoPage() {
  const ctx = await requireBusiness();
  if (ctx.licencia.vigente) redirect("/panel");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <Logotipo className="h-11" />

      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          La licencia de {ctx.business.name} está vencida
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Tus datos están intactos y no se borra nada. Renová la suscripción y el
          negocio vuelve a funcionar en el momento.
        </p>
        <p className="text-muted-foreground text-sm">
          {formatCop(50000)} al mes por negocio.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/facturacion">Renovar suscripción</Link>
        </Button>
        <form action={salir}>
          <Button type="submit" variant="outline" size="lg">
            Salir
          </Button>
        </form>
      </div>
    </div>
  );
}
