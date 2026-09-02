import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { getCartera, TOPE_DEUDORES } from "@/features/cartera/queries";
import { getSettings } from "@/features/negocio/queries";
import { EncabezadoPantalla } from "@/components/marca/pantalla";
import { requireActiveLicense } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { PanelCartera } from "./panel-cartera";

export const metadata: Metadata = { title: "Cartera · Platlia" };
export const dynamic = "force-dynamic";

export default async function CarteraPage() {
  // La página verifica por su cuenta, como todas: sesión, empresa y licencia.
  const ctx = await requireActiveLicense();
  const settings = await getSettings(ctx.business.id);

  // Dos puertas: que el negocio fíe, y que este rol pueda ver la cartera. Se
  // llega por URL sin pasar por el menú, así que la guarda va acá.
  if (
    !settings.creditoEnabled ||
    !tienePermisoSeccion(ctx.role, "cartera", settings.rolePermissions)
  ) {
    notFound();
  }

  const deudores = await getCartera(ctx.business.id);
  const totalCop = deudores.reduce((suma, d) => suma + d.deudaCop, 0);

  return (
    <div className="space-y-6">
      <EncabezadoPantalla
        titulo="Cartera"
        descripcion="Lo que quedó fiado: quién debe, cuánto y desde cuándo."
      />

      <PanelCartera
        deudores={deudores}
        totalCop={totalCop}
        tope={TOPE_DEUDORES}
        puedeCondonar={ctx.role === Role.PROPIETARIO}
      />
    </div>
  );
}
