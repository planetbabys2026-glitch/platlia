import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getFacturacion } from "@/features/facturacion/queries";
import { requireRole } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { faltantesParaFacturar } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { tenantDb } from "@/lib/db/tenant";
import { PanelConfiguracion } from "./panel-configuracion";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO, Role.COCINA);
  const esPropietario = ctx.role === Role.PROPIETARIO;
  const db = tenantDb(ctx.business.id);

  const [negocio, settings, facturacion, mesas] = await Promise.all([
    db.business.findFirstOrThrow({
      select: {
        name: true,
        slug: true,
        legalName: true,
        taxId: true,
        address: true,
        phone: true,
        email: true,
      },
    }),
    getSettings(ctx.business.id),
    esPropietario ? getFacturacion(ctx.business.id) : Promise.resolve(null),
    db.table.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!esPropietario && !tienePermisoSeccion(ctx.role, "configuracion", settings.rolePermissions)) {
    notFound();
  }

  /**
   * Las credenciales de Factus NO cruzan a un componente cliente.
   *
   * `PanelConfiguracion` es `"use client"`: todo lo que reciba viaja al navegador
   * dentro de la carga de RSC y se puede leer en el código fuente de la página.
   *
   * Antes había que sacarle a mano las cuatro credenciales de Factus. Ya no viven
   * en `BusinessSettings` —la cuenta es de la plataforma y está en el entorno—,
   * así que no queda ningún secreto en esta tabla que pueda colarse.
   */

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Todo lo que acá se cambia vale solo para este negocio.
        </p>
      </div>

      <PanelConfiguracion
        negocio={negocio}
        settings={{
          ...settings,
          faltantesParaFacturar: faltantesParaFacturar(settings, plataformaFacturaConfigurada()),
        }}
        facturacion={facturacion}
        mesasHabilitado={ctx.modules.has(AppModule.MESAS)}
        esPropietario={esPropietario}
        slug={negocio.slug}
        mesas={mesas}
      />
    </div>
  );
}
