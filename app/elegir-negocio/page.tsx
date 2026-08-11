import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
import { requireUser } from "@/lib/auth/dal";
// Justamente se está eligiendo con cuál empresa trabajar: todavía no hay
// businessId con el que acotar.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { SelectorNegocio } from "./selector";

export const metadata: Metadata = { title: "Elegir Sucursal · Platlia" };
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
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 min-h-screen bg-[radial-gradient(640px_480px_at_50%_35%,color-mix(in_oklch,var(--brasa)_7%,transparent),transparent_70%)]">
      <Logotipo size="lg" eyebrow="CAMBIO DE CASA" />

      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            — Multi-tenant Platlia
          </p>
          <h1 className="font-display font-black text-4xl sm:text-5xl uppercase tracking-tight text-foreground leading-[0.95]">
            ¿En cuál trabajas hoy?
          </h1>
          <p className="text-muted-foreground text-sm">
            Puedes cambiar de negocio o sucursal cuando quieras.
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

        <div className="pt-4 text-center font-mono text-[10.5px] text-muted-foreground/60 tracking-wider">
          PLATLIA MULTI-TENANT ARCHITECTURE · COLOMBIA
        </div>
      </div>
    </div>
  );
}
