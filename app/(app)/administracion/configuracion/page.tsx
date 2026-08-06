import type { Metadata } from "next";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getFacturacion } from "@/features/facturacion/queries";
import { requireRole } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import { PanelConfiguracion } from "./panel-configuracion";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR);
  const esPropietario = ctx.role === Role.PROPIETARIO;

  const [negocio, settings, facturacion] = await Promise.all([
    tenantDb(ctx.business.id).business.findFirstOrThrow({
      select: {
        name: true,
        legalName: true,
        taxId: true,
        address: true,
        phone: true,
        email: true,
      },
    }),
    getSettings(ctx.business.id),
    esPropietario ? getFacturacion(ctx.business.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Todo lo que acá se cambia vale solo para este negocio.
        </p>
      </div>

      <PanelConfiguracion
        negocio={negocio}
        settings={settings}
        facturacion={facturacion}
        mesasHabilitado={ctx.modules.has(AppModule.MESAS)}
        esPropietario={esPropietario}
      />
    </div>
  );
}
