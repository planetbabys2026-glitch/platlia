import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
import { requireUser } from "@/lib/auth/dal";
// Todavía no hay empresa con la cual acotar: es exactamente el caso que este
// onboarding resuelve.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { FormularioNegocio } from "./formulario";

export const metadata: Metadata = { title: "Creá tu negocio" };
export const dynamic = "force-dynamic";

/**
 * Para una cuenta que quedó sin ningún negocio: alguien invitado que perdió su
 * membresía, o un registro a medio terminar. Si ya tiene negocios, no pinta acá.
 */
export default async function OnboardingPage() {
  const ctx = await requireUser();

  const cuantas = await rootDb.membership.count({
    where: { userId: ctx.user.id, active: true },
  });
  if (cuantas > 0) redirect("/elegir-negocio");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <Logotipo className="h-11" />

      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Creá tu negocio</h1>
          <p className="text-muted-foreground text-sm">
            Tu cuenta todavía no tiene ninguno. Con el nombre alcanza para empezar.
          </p>
        </div>

        <FormularioNegocio />
      </div>
    </div>
  );
}
