import type { Metadata } from "next";
import { Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import { FormularioDatos, FormularioOperacion } from "./formularios";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR);

  const [negocio, settings] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Todo lo que acá se cambia vale solo para este negocio.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Datos del negocio</h2>
          <FormularioDatos negocio={negocio} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Operación</h2>
          <FormularioOperacion
            operacion={{
              timeZone: settings.timeZone,
              businessDayStartMinutes: settings.businessDayStartMinutes,
              pricesIncludeTax: settings.pricesIncludeTax,
              tipSuggestionEnabled: settings.tipSuggestionEnabled,
              tipSuggestionRateBp: settings.tipSuggestionRateBp,
              cashRoundingCop: settings.cashRoundingCop,
              requireOpenCashSession: settings.requireOpenCashSession,
              turnNumberMax: settings.turnNumberMax,
              receiptWidth: settings.receiptWidth,
              receiptHeader: settings.receiptHeader,
              receiptFooter: settings.receiptFooter,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
