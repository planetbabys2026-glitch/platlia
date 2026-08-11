import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import { getComandas } from "@/features/cocina/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { currentBusinessDate } from "@/lib/time";
import { PantallaCocina } from "./pantalla-cocina";

export const metadata: Metadata = { title: "Cocina" };
export const dynamic = "force-dynamic";

export default async function CocinaPage() {
  const ctx = await requireModule(AppModule.COCINA);
  const settings = await getSettings(ctx.business.id);
  const estaciones = await getComandas(
    ctx.business.id,
    currentBusinessDate(settings),
  );

  return <PantallaCocina initialEstaciones={estaciones} />;
}
