import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppModule } from "@/generated/prisma/enums";
import { getCajaAbierta } from "@/features/caja/queries";
import { getCarta, getPedido, getPedidosAbiertos } from "@/features/pedidos/queries";
import { getSettings } from "@/features/negocio/queries";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { requireModule } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
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

  // `pos` y no `salon_pos`: el mesero tiene salón y no tiene mostrador. La
  // pantalla se alcanza por URL sin pasar por el menú, así que la guarda va acá.
  if (!tienePermisoSeccion(ctx.role, "pos", settings.rolePermissions)) {
    notFound();
  }

  const usaMesas = ctx.modules.has(AppModule.MESAS);

  return (
    <ModuloPosInteractive
      carta={carta}
      caja={caja}
      pedidosAbiertos={pedidos}
      pedidoInicial={pedidoInicial}
      puedeFacturar={puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada())}
      usaMesas={usaMesas}
      settings={{
        inventoryEnabled: settings.inventoryEnabled,
        permitirVentaSinStock: settings.permitirVentaSinStock,
        deliveryEnabled: settings.deliveryEnabled,
        deliveryFeeCop: settings.deliveryFeeCop,
        requireOpenCashSession: settings.requireOpenCashSession,
        cashRoundingCop: settings.cashRoundingCop,
        pricesIncludeTax: settings.pricesIncludeTax,
        tipSuggestionEnabled: settings.tipSuggestionEnabled,
        tipSuggestionRateBp: settings.tipSuggestionRateBp,
      }}
    />
  );
}
