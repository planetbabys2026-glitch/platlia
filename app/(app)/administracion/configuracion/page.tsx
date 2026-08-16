import type { Metadata } from "next";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getFacturacion } from "@/features/facturacion/queries";
import { requireRole } from "@/lib/auth/dal";
import { faltantesParaFacturar } from "@/lib/billing/factus-habilitacion";
import { tenantDb } from "@/lib/db/tenant";
import { PanelConfiguracion } from "./panel-configuracion";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR);
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

  /**
   * Las credenciales de Factus NO cruzan a un componente cliente.
   *
   * `PanelConfiguracion` es `"use client"`: todo lo que reciba viaja al navegador
   * dentro de la carga de RSC y se puede leer en el código fuente de la página.
   * Se sacan del objeto por destructuring —y no eligiendo campo por campo— para
   * que una columna secreta que se agregue mañana no se cuele por olvido; en su
   * lugar viaja solo si está cargada, que es lo único que el formulario necesita
   * para pintarse.
   */
  const {
    factusClientId,
    factusClientSecret,
    factusUsername,
    factusPassword,
    ...settingsSinSecretos
  } = settings;

  const cargada = (valor: string | null) => Boolean(valor && valor.trim() !== "");

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
        settings={{
          ...settingsSinSecretos,
          tieneClientId: cargada(factusClientId),
          tieneClientSecret: cargada(factusClientSecret),
          tieneUsername: cargada(factusUsername),
          tienePassword: cargada(factusPassword),
          faltantesParaFacturar: faltantesParaFacturar(settings),
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
