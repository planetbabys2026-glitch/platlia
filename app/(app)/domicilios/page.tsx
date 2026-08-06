import type { Metadata } from "next";
import { getDomicilios } from "@/features/domicilios/queries";
import { getTimeSettings } from "@/features/negocio/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { PanelDomicilios } from "./panel-domicilios";

export const metadata: Metadata = { title: "Domicilios" };
export const dynamic = "force-dynamic";

export default async function DomiciliosPage() {
  const ctx = await requireBusiness();

  const [domicilios, timeSettings] = await Promise.all([
    getDomicilios(ctx.business.id),
    getTimeSettings(ctx.business.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Gestión de Domicilios</h1>
        <p className="text-muted-foreground text-sm">
          Control de pedidos a domicilio generados por código QR y mostrador. Actualizado en tiempo real.
        </p>
      </div>

      <PanelDomicilios domicilios={domicilios} timeZone={timeSettings.timeZone} />
    </div>
  );
}
