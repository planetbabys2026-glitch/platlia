import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import { getCajaAbierta } from "@/features/caja/queries";
import { getCarta, getPedido, getPedidosAbiertos } from "@/features/pedidos/queries";
import { getSettings } from "@/features/negocio/queries";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { requireModule } from "@/lib/auth/dal";
import { ModuloPosInteractive } from "./modulo-pos-interactive";

export const metadata: Metadata = { title: "Pedido sin mesa" };
export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedidoId?: string }>;
}) {
  const { pedidoId } = await searchParams;
  const ctx = await requireModule(AppModule.PEDIDOS);

  const [caja, pedidos, settings, carta, pedidoInicial] = await Promise.all([
    getCajaAbierta(ctx.business.id),
    getPedidosAbiertos(ctx.business.id),
    getSettings(ctx.business.id),
    getCarta(ctx.business.id),
    pedidoId ? getPedido(ctx.business.id, pedidoId) : Promise.resolve(null),
  ]);

  return (
    <ModuloPosInteractive
      carta={carta}
      caja={caja}
      pedidosAbiertos={pedidos}
      pedidoInicial={pedidoInicial}
      puedeFacturar={puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada())}
      settings={{
        inventoryEnabled: settings.inventoryEnabled,
        deliveryEnabled: settings.deliveryEnabled,
        requireOpenCashSession: settings.requireOpenCashSession,
        cashRoundingCop: settings.cashRoundingCop,
        pricesIncludeTax: settings.pricesIncludeTax,
        tipSuggestionEnabled: settings.tipSuggestionEnabled,
        tipSuggestionRateBp: settings.tipSuggestionRateBp,
      }}
    />
  );
}
