import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
import { requireUser } from "@/lib/auth/dal";
// Justamente se está eligiendo con cuál empresa trabajar: todavía no hay
// businessId con el que acotar.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { SelectorNegocio } from "./selector";

export const metadata: Metadata = { title: "Elegí un negocio" };
export const dynamic = "force-dynamic";

/** Para quien trabaja en más de un local: dueña de dos bares, contadora de varios. */
export default async function ElegirNegocioPage() {
  const ctx = await requireUser();

  const membresias = await rootDb.membership.findMany({
    where: { userId: ctx.user.id, active: true, business: { deletedAt: null } },
    select: {
      role: true,
      business: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (membresias.length === 0) redirect("/onboarding");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <Logotipo className="h-11" />

      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">¿En cuál trabajás hoy?</h1>
          <p className="text-muted-foreground text-sm">
            Podés cambiar de negocio cuando quieras.
          </p>
        </div>

        <SelectorNegocio
          negocios={membresias.map(({ business, role }) => ({
            id: business.id,
            name: business.name,
            role,
            activo: business.status === "ACTIVO",
          }))}
        />
      </div>
    </div>
  );
}
