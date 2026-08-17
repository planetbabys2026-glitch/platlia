import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppModule } from "@/generated/prisma/enums";
import { getComandas } from "@/features/cocina/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { currentBusinessDate } from "@/lib/time";
import { PantallaCocina } from "./pantalla-cocina";

export const metadata: Metadata = { title: "Cocina" };
export const dynamic = "force-dynamic";

export default async function CocinaPage() {
  const ctx = await requireModule(AppModule.COCINA);
  const settings = await getSettings(ctx.business.id);
  if (!tienePermisoSeccion(ctx.role, "cocina", settings.rolePermissions)) {
    notFound();
  }
  const estaciones = await getComandas(
    ctx.business.id,
    currentBusinessDate(settings),
  );

  return <PantallaCocina initialEstaciones={estaciones} />;
}

