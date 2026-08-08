import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDomicilios } from "@/features/domicilios/queries";
import { getSettings, getTimeSettings } from "@/features/negocio/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { PanelDomicilios } from "./panel-domicilios";

export const metadata: Metadata = { title: "Domicilios en Vivo · Platlia" };
export const dynamic = "force-dynamic";

export default async function DomiciliosPage() {
  const ctx = await requireBusiness();

  const settings = await getSettings(ctx.business.id);
  if (!settings.deliveryEnabled) {
    notFound();
  }

  const [domicilios, timeSettings] = await Promise.all([
    getDomicilios(ctx.business.id),
    getTimeSettings(ctx.business.id),
  ]);

  const activosCount = domicilios.filter((d) => d.status !== "ENTREGADO" && d.status !== "CANCELADO").length;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-foreground leading-[0.95]">
            Domicilios
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 font-sans">
            Trazabilidad en tiempo real · Chat directo de WhatsApp y asignación de repartidores.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="chip is-hot">
            {activosCount} {activosCount === 1 ? "EN CURSO" : "EN CURSO"}
          </span>
        </div>
      </div>

      <PanelDomicilios domicilios={domicilios} timeZone={timeSettings.timeZone} />
    </div>
  );
}
