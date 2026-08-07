"use client";

import { useState } from "react";
import {
  Blocks,
  Building2,
  Crown,
  FileText,
  QrCode,
  SlidersHorizontal,
  Tv,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FormularioDatos,
  FormularioFactus,
  FormularioLicencia,
  FormularioModulos,
  FormularioOperacion,
  FormularioQrMenu,
  FormularioTurnero,
} from "./formularios";

import type { ReceiptWidth } from "@/generated/prisma/enums";

type PanelConfiguracionProps = {
  negocio: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  settings: {
    deliveryEnabled: boolean;
    inventoryEnabled: boolean;
    recipesEnabled: boolean;
    turneroMediaMode: string;
    turneroImages: string;
    turneroImageIntervalSeconds: number;
    turneroYoutubeUrl: string | null;
    turneroBadgePosition: string;
    timeZone: string;
    businessDayStartMinutes: number;
    pricesIncludeTax: boolean;
    tipSuggestionEnabled: boolean;
    tipSuggestionRateBp: number;
    cashRoundingCop: number;
    requireOpenCashSession: boolean;
    turnNumberMax: number;
    receiptWidth: ReceiptWidth;
    receiptHeader: string | null;
    receiptFooter: string | null;
    qrMenuEnabled: boolean;
    qrMenuBgMode: string;
    qrMenuBgColor: string;
    qrMenuBgGradient: string;
    qrMenuBgImageUrl: string | null;
    qrMenuLogoUrl: string | null;
    qrMenuHeaderTitle: string | null;
    qrMenuHeaderSubtitle: string | null;
    facturacionElectronicaHabilitada: boolean;
    paquetesDocumentosDisponibles: number;
    documentosEmitidosConsumidos: number;
    factusNumberingRangeId: number | null;
    municipalityCode: string | null;
    identificationDocumentCode?: string | null;
    legalOrganizationCode?: string | null;
    tributeCode?: string | null;
    responsibilities?: string | null;
  };
  facturacion: {
    suscripcion: {
      id: string;
      status: string;
      priceCop: number;
      trialEndsAt: Date | null;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      graceUntil: Date | null;
      canceledAt: Date | null;
    } | null;
    pagos: unknown[];
  } | null;
  mesasHabilitado: boolean;
  esPropietario: boolean;
  slug: string;
  mesas: { id: string; name: string }[];
};

type TabId = "datos" | "modulos" | "turnero" | "qr" | "operacion" | "factus" | "licencia";

export function PanelConfiguracion({
  negocio,
  settings,
  facturacion,
  mesasHabilitado,
  esPropietario,
  slug,
  mesas,
}: PanelConfiguracionProps) {
  const [tabActiva, setTabActiva] = useState<TabId>("datos");

  const tabs = [
    { id: "datos" as TabId, label: "Datos del negocio", icono: Building2 },
    { id: "modulos" as TabId, label: "Módulos", icono: Blocks },
    { id: "turnero" as TabId, label: "Turnero TV", icono: Tv },
    { id: "qr" as TabId, label: "Menú Digital QR", icono: QrCode },
    { id: "operacion" as TabId, label: "Operación y Recibos", icono: SlidersHorizontal },
    { id: "factus" as TabId, label: "Facturación DIAN", icono: FileText },
    ...(esPropietario && facturacion
      ? [{ id: "licencia" as TabId, label: "Licencia y Sucursales", icono: Crown }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          Navegación por Píldoras (Submódulos de Configuración)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-border/80">
        {tabs.map((tab) => {
          const Icono = tab.icono;
          const activa = tabActiva === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTabActiva(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap border shrink-0",
                activa
                  ? "bg-brand text-white border-brand shadow-md dark:bg-brand-accent dark:text-slate-950 font-bold scale-[1.02]"
                  : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground",
              )}
            >
              <Icono className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          Contenido de la Píldora Seleccionada
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === "datos" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Datos del negocio</h2>
              <p className="text-muted-foreground text-xs">
                Información legal y de contacto que aparece en los tiquetes e impresiones.
              </p>
            </div>
            <FormularioDatos negocio={negocio} />
          </CardContent>
        </Card>
      )}

      {tabActiva === "modulos" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Módulos del sistema</h2>
              <p className="text-muted-foreground text-xs">
                Activá o desactivá los módulos según la operación de tu establecimiento.
              </p>
            </div>
            <FormularioModulos
              mesasHabilitado={mesasHabilitado}
              deliveryEnabled={settings.deliveryEnabled}
              inventoryEnabled={settings.inventoryEnabled}
              recipesEnabled={settings.recipesEnabled}
            />
          </CardContent>
        </Card>
      )}

      {tabActiva === "turnero" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Turnero del Salón</h2>
              <p className="text-muted-foreground text-xs">
                Personalizá la pantalla del televisor: imágenes de fondo, canal de YouTube y ubicación del recuadro.
              </p>
            </div>
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
      )}

      {tabActiva === "qr" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Menú Digital QR y Tarjetas de Mesas</h2>
              <p className="text-muted-foreground text-xs">
                Personalizá el diseño del menú público para clientes y generá códigos QR para tus mesas o pedidos a domicilio.
              </p>
            </div>
            <FormularioQrMenu
              settings={{
                qrMenuEnabled: settings.qrMenuEnabled,
                qrMenuBgMode: settings.qrMenuBgMode,
                qrMenuBgColor: settings.qrMenuBgColor,
                qrMenuBgGradient: settings.qrMenuBgGradient,
                qrMenuBgImageUrl: settings.qrMenuBgImageUrl,
                qrMenuLogoUrl: settings.qrMenuLogoUrl,
                qrMenuHeaderTitle: settings.qrMenuHeaderTitle,
                qrMenuHeaderSubtitle: settings.qrMenuHeaderSubtitle,
                slug,
                mesas,
                deliveryEnabled: settings.deliveryEnabled,
              }}
            />
          </CardContent>
        </Card>
      )}

      {tabActiva === "operacion" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Parámetros Operativos y Recibos</h2>
              <p className="text-muted-foreground text-xs">
                Configuración de jornada de negocio, propina sugerida, redondeo en efectivo y encabezados de impresión.
              </p>
            </div>
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
      )}

      {tabActiva === "factus" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Facturación Electrónica DIAN (Factus API)</h2>
              <p className="text-muted-foreground text-xs">
                Configuración del paquete de documentos y credenciales de transmisión DIAN.
              </p>
            </div>
            <FormularioFactus
              settings={{
                facturacionElectronicaHabilitada: settings.facturacionElectronicaHabilitada,
                paquetesDocumentosDisponibles: settings.paquetesDocumentosDisponibles,
                documentosEmitidosConsumidos: settings.documentosEmitidosConsumidos,
                factusNumberingRangeId: settings.factusNumberingRangeId,
                municipalityCode: settings.municipalityCode,
                identificationDocumentCode: settings.identificationDocumentCode,
                legalOrganizationCode: settings.legalOrganizationCode,
                tributeCode: settings.tributeCode,
                responsibilities: settings.responsibilities,
              }}
            />
          </CardContent>
        </Card>
      )}

      {tabActiva === "licencia" && esPropietario && facturacion && (
        <Card className="border-brand/40 shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Licencia y Sucursales</h2>
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
    </div>
  );
}
