import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getTurnero } from "@/features/turnero/queries";
import { requireModule } from "@/lib/auth/dal";
import { currentBusinessDate } from "@/lib/time";
import { PantallaTurnero } from "./pantalla-turnero";

export const metadata: Metadata = {
  title: "Turnos",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * El televisor del salón.
 *
 * Muestra las órdenes listas para el comensal con aviso sonoro y animación destacada.
 * Permite fondo multimedia (carrusel de imágenes o video de YouTube) y posicionamiento
 * configurable del recuadro de turnos listos.
 */
export default async function TurneroPage() {
  const ctx = await requireModule(AppModule.PEDIDOS);
  const settings = await getSettings(ctx.business.id);
  const { listos } = await getTurnero(
    ctx.business.id,
    currentBusinessDate(settings),
  );

  return (
    <PantallaTurnero
      businessName={ctx.business.name}
      turnNumberMax={settings.turnNumberMax}
      listos={listos}
      mediaMode={settings.turneroMediaMode}
      imagesRaw={settings.turneroImages}
      imageIntervalSeconds={settings.turneroImageIntervalSeconds}
      youtubeUrl={settings.turneroYoutubeUrl}
      badgePosition={settings.turneroBadgePosition}
    />
  );
}
