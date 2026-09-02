import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppModule } from "@/generated/prisma/enums";
import { getComandas } from "@/features/cocina/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { usaKds } from "@/features/caja/reglas";
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

  /**
   * Con la comanda en "solo papel" esta pantalla no existe.
   *
   * No es una restricción: es que no hay nada que mostrar ni nadie que la mueva.
   * La comanda sale impresa y el estado de los platos no lo toca nadie, así que
   * el KDS quedaría vacío toda la noche mientras la cocina trabaja con el papel
   * en la mano. Se llega por URL sin pasar por el menú, así que la guarda va acá.
   */
  if (!usaKds(settings.comandaDestino)) notFound();
  const estaciones = await getComandas(
    ctx.business.id,
    currentBusinessDate(settings),
  );

  return (
    <PantallaCocina
      initialEstaciones={estaciones}
      actorId={ctx.user.id}
      actorRole={ctx.role}
    />
  );
}

