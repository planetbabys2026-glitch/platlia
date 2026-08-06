import type { Metadata } from "next";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getFacturacion } from "@/features/facturacion/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import {
  FormularioDatos,
  FormularioLicencia,
  FormularioModulos,
  FormularioOperacion,
  FormularioTurnero,
} from "./formularios";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR);
  const esPropietario = ctx.role === Role.PROPIETARIO;

  const [negocio, settings, facturacion] = await Promise.all([
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
    esPropietario ? getFacturacion(ctx.business.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Todo lo que acá se cambia vale solo para este negocio.
        </p>
      </div>

      {esPropietario && facturacion && (
        <Card className="border-brand/40 shadow-sm">
          <CardContent className="space-y-4">
            <div>
              <h2 className="font-medium">Licencia y Sucursales</h2>
              <p className="text-muted-foreground text-xs">
                Mapeo de tu plan activo, pago de licencias con MercadoPago y solicitud de nuevas sedes (Exclusivo Propietario).
              </p>
            </div>
            <FormularioLicencia
              suscripcion={facturacion.suscripcion}
              timeZone={settings.timeZone}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Datos del negocio</h2>
          <FormularioDatos negocio={negocio} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Módulos</h2>
          <p className="text-muted-foreground text-sm">
            No todo negocio usa lo mismo: un local de mostrador no tiene mesas que sentar.
          </p>
          <FormularioModulos
            mesasHabilitado={ctx.modules.has(AppModule.MESAS)}
            deliveryEnabled={settings.deliveryEnabled}
            inventoryEnabled={settings.inventoryEnabled}
            recipesEnabled={settings.recipesEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Turnero del Salón</h2>
          <p className="text-muted-foreground text-sm">
            Personalizá la pantalla del televisor: multimedia de fondo, carrusel de fotos publicitaria o video de YouTube, y la posición del recuadro de turnos listos.
          </p>
          <FormularioTurnero
            settings={{
              turneroMediaMode: settings.turneroMediaMode,
              turneroImages: settings.turneroImages,
              turneroImageIntervalSeconds: settings.turneroImageIntervalSeconds,
              turneroYoutubeUrl: settings.turneroYoutubeUrl,
              turneroBadgePosition: settings.turneroBadgePosition,
            }}
          />
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
