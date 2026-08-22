"use client";

import { useVistaEnUrl } from "@/lib/vista-en-url";
import { Card, CardContent } from "@/components/ui/card";
import {
  FormularioDatos,
  FormularioFactus,
  FormularioLicencia,
  FormularioModulos,
  FormularioOperacion,
  FormularioQrMenu,
  FormularioTurnero,
} from "./formularios";
import { FormularioPermisosRoles } from "./formulario-permisos-roles";
import {
  FormularioImpresoras,
  type ConfiguracionImpresionProps,
} from "./formulario-impresoras";

import type { ReceiptWidth } from "@/generated/prisma/enums";
import type { ListaDePrecios } from "@/lib/billing/precios";

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
    deliveryPaused: boolean;
    deliveryFeeCop: number;
    inventoryEnabled: boolean;
    permitirVentaSinStock: boolean;
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
<<<<<<< HEAD
    scheduleEnabled: boolean;
    scheduleOpeningTime: string;
    scheduleClosingTime: string;
    scheduleStatus: string;
=======
    comandaDestino: string;
>>>>>>> 424db5e1eef19ef9edbb4193f9eb8f5af8ad5591
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
    qrMenuAccent: string;
    estimatedPrepTimeText: string | null;
    facturacionElectronicaHabilitada: boolean;
    paquetesDocumentosDisponibles: number;
    documentosEmitidosConsumidos: number;
    factusNumberingRangeId: number | null;
    municipalityCode: string | null;
    faltantesParaFacturar: string[];
    rolePermissions?: string | null;
  };
  facturacion: {
    suscripcion: {
      id: string;
      status: string;
      trialEndsAt: Date | null;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      graceUntil: Date | null;
      canceledAt: Date | null;
    } | null;
    pagos: unknown[];
  } | null;
  /** La lista de precios vigente y cuántas sedes cubre la cuenta. Con eso alcanza
   *  para cotizar acá con la misma función que el checkout. */
  licencia: {
    sedes: number;
    lista: ListaDePrecios;
    base: ListaDePrecios;
    promo: ListaDePrecios | null;
  } | null;
  /** Null para quien no administra: no configura impresoras. */
  impresion: Omit<ConfiguracionImpresionProps, "comandaDestino" | "timeZone"> | null;
  mesasHabilitado: boolean;
  esPropietario: boolean;
  slug: string;
  mesas: { id: string; name: string }[];
};

type TabId =
  | "datos"
  | "modulos"
  | "permisos"
  | "turnero"
  | "qr"
  | "operacion"
  | "impresoras"
  | "factus"
  | "licencia";

export function PanelConfiguracion({
  negocio,
  settings,
  facturacion,
  licencia,
  impresion,
  mesasHabilitado,
  esPropietario,
  slug,
  mesas,
}: PanelConfiguracionProps) {
  // La sección vive en la URL: es lo que permite que el menú lateral enlace
  // "Menú digital QR" en vez de dejar al usuario buscarla adentro. Sin la tira de
  // píldoras ya nadie la cambia desde acá, así que el setter no se usa.
  const [tabActiva] = useVistaEnUrl<TabId>(
    "vista",
    ["datos", "modulos", "permisos", "turnero", "qr", "operacion", "impresoras", "factus", "licencia"],
    "datos",
  );

  return (
    <div className="space-y-6">
      {/* La tira de píldoras que había acá se fue: las ocho secciones se abren
          desde el menú lateral, como en Informes. Cada panel ya trae su propio
          `h2` con el nombre de la sección, así que no hace falta reponer nada
          para saber dónde está uno parado. */}
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
              deliveryPaused={settings.deliveryPaused}
              deliveryFeeCop={settings.deliveryFeeCop}
              inventoryEnabled={settings.inventoryEnabled}
              permitirVentaSinStock={settings.permitirVentaSinStock}
              recipesEnabled={settings.recipesEnabled}
            />
          </CardContent>
        </Card>
      )}

      {tabActiva === "permisos" && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <FormularioPermisosRoles rolePermissionsRaw={settings.rolePermissions} />
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
                qrMenuAccent: settings.qrMenuAccent,
                estimatedPrepTimeText: settings.estimatedPrepTimeText,
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
                Configuración de jornada de negocio, horarios de atención, propina sugerida, redondeo en efectivo y recibos.
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
                scheduleEnabled: settings.scheduleEnabled,
                scheduleOpeningTime: settings.scheduleOpeningTime,
                scheduleClosingTime: settings.scheduleClosingTime,
                scheduleStatus: settings.scheduleStatus,
                receiptWidth: settings.receiptWidth,
                receiptHeader: settings.receiptHeader,
                receiptFooter: settings.receiptFooter,
              }}
            />
          </CardContent>
        </Card>
      )}

      {tabActiva === "impresoras" && impresion && (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="font-semibold text-lg">Impresión térmica</h2>
              <p className="text-muted-foreground text-xs">
                Comandas y recibos directo a las impresoras del local, sin abrir una
                pestaña ni tocar el diálogo del navegador.
              </p>
            </div>
            <FormularioImpresoras
              {...impresion}
              comandaDestino={settings.comandaDestino}
              timeZone={settings.timeZone}
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
                Estado del módulo y del paquete de documentos. La configuración la carga el equipo
                de Platlia.
              </p>
            </div>
            <FormularioFactus
              settings={{
                facturacionElectronicaHabilitada: settings.facturacionElectronicaHabilitada,
                paquetesDocumentosDisponibles: settings.paquetesDocumentosDisponibles,
                documentosEmitidosConsumidos: settings.documentosEmitidosConsumidos,
                factusNumberingRangeId: settings.factusNumberingRangeId,
                municipalityCode: settings.municipalityCode,
                faltantes: settings.faltantesParaFacturar,
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
              sedes={licencia?.sedes ?? 1}
              lista={licencia?.lista ?? null}
              base={licencia?.base ?? null}
              promo={licencia?.promo ?? null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
