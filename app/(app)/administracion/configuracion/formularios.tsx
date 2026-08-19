"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ReceiptWidth } from "@/generated/prisma/enums";
import { guardarDatosNegocio, guardarModulos, guardarOperacion, guardarQrMenuSettings, guardarTurneroSettings, subirImagenQrMenu } from "@/features/negocio/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { solicitarSedeAdicional } from "@/features/facturacion/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { enlaceWhatsapp } from "@/lib/soporte";
import { diasParaElCorte } from "@/lib/billing/suscripcion";
import { cotizarTodas, type ListaDePrecios } from "@/lib/billing/precios";
import { AvisoPromocion } from "@/features/facturacion/components/aviso-promocion";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
import { acentoSirveComoTexto } from "@/lib/contraste";
import { cn } from "@/lib/utils";

/** Las zonas que un negocio colombiano puede necesitar de verdad. */
const ZONAS = [
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/Panama",
  "America/Caracas",
  "America/Guayaquil",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
];

function Enviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : children}
    </Button>
  );
}

function Resultado({ estado }: { estado: { ok: boolean; error?: string } }) {
  if (!estado.ok && estado.error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{estado.error}</AlertDescription>
      </Alert>
    );
  }
  if (estado.ok) {
    return (
      <Alert role="status">
        <AlertDescription>Guardado.</AlertDescription>
      </Alert>
    );
  }
  return null;
}

function Campo({
  label,
  name,
  ayuda,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string; ayuda?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
      {ayuda && <p className="text-muted-foreground text-xs">{ayuda}</p>}
    </div>
  );
}

function Casilla({
  label,
  name,
  defaultChecked,
  ayuda,
}: {
  label: string;
  name: string;
  defaultChecked: boolean;
  ayuda?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="accent-primary mt-0.5 size-4"
        />
        <span>{label}</span>
      </label>
      {ayuda && <p className="text-muted-foreground ml-6 text-xs">{ayuda}</p>}
    </div>
  );
}

export type DatosNegocio = {
  name: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function FormularioDatos({ negocio }: { negocio: DatosNegocio }) {
  const [estado, accion] = useActionState(guardarDatosNegocio, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <Resultado estado={estado} />
      <Campo label="Nombre" name="name" defaultValue={negocio.name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label="Razón social"
          name="legalName"
          defaultValue={negocio.legalName ?? ""}
          ayuda="Sale impresa en el tiquete."
        />
        <Campo label="NIT" name="taxId" defaultValue={negocio.taxId ?? ""} />
      </div>
      <Campo label="Dirección" name="address" defaultValue={negocio.address ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Teléfono" name="phone" defaultValue={negocio.phone ?? ""} />
        <Campo label="Correo" name="email" type="email" defaultValue={negocio.email ?? ""} />
      </div>
      <Enviar>Guardar datos</Enviar>
    </form>
  );
}

export type Operacion = {
  timeZone: string;
  businessDayStartMinutes: number;
  pricesIncludeTax: boolean;
  tipSuggestionEnabled: boolean;
  tipSuggestionRateBp: number;
  cashRoundingCop: number;
  requireOpenCashSession: boolean;
  turnNumberMax: number;
  receiptWidth: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
};

function comoHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function FormularioOperacion({ operacion }: { operacion: Operacion }) {
  const [estado, accion] = useActionState(guardarOperacion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-5">
      <Resultado estado={estado} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="timeZone">Zona horaria</Label>
          <select
            id="timeZone"
            name="timeZone"
            defaultValue={operacion.timeZone}
            className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            {ZONAS.map((zona) => (
              <option key={zona} value={zona}>
                {zona}
              </option>
            ))}
          </select>
        </div>

        <Campo
          label="La jornada empieza a las"
          name="businessDayStart"
          defaultValue={comoHora(operacion.businessDayStartMinutes)}
          placeholder="05:00"
          required
          ayuda="Lo vendido antes de esta hora cuenta para el día anterior."
        />
      </div>

      <Casilla
        name="pricesIncludeTax"
        label="Los precios de la carta ya incluyen el impuesto"
        defaultChecked={operacion.pricesIncludeTax}
        ayuda="Como se acostumbra en Colombia: el cliente ve $18.900 y paga $18.900."
      />

      <Casilla
        name="requireOpenCashSession"
        label="Exigir caja abierta para tomar pedidos"
        defaultChecked={operacion.requireOpenCashSession}
        ayuda="Apagalo si los meseros toman pedidos antes de que llegue el cajero."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label="Redondeo del efectivo"
          name="cashRoundingCop"
          inputMode="numeric"
          defaultValue={operacion.cashRoundingCop}
          ayuda="La moneda más chica que circula. Solo afecta al pago, no al total."
        />
        <Campo
          label="Turno máximo"
          name="turnNumberMax"
          type="number"
          min={9}
          max={999}
          defaultValue={operacion.turnNumberMax}
          ayuda="Al llegar a este número, el turnero vuelve a 1."
        />
      </div>

      <Casilla
        name="tipSuggestionEnabled"
        label="Sugerir propina al cobrar"
        defaultChecked={operacion.tipSuggestionEnabled}
        ayuda="La propina es voluntaria y hay que preguntarla antes de sumarla."
      />

      <Campo
        label="Propina sugerida (%)"
        name="tipSuggestionRate"
        inputMode="decimal"
        defaultValue={(operacion.tipSuggestionRateBp / 100).toString().replace(".", ",")}
      />

      <div className="space-y-1.5">
        <Label htmlFor="receiptWidth">Ancho del tiquete</Label>
        <select
          id="receiptWidth"
          name="receiptWidth"
          defaultValue={operacion.receiptWidth}
          className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
        >
          <option value={ReceiptWidth.MM80}>80 mm</option>
          <option value={ReceiptWidth.MM55}>55 mm</option>
        </select>
      </div>

      <Campo
        label="Encabezado del tiquete"
        name="receiptHeader"
        defaultValue={operacion.receiptHeader ?? ""}
        ayuda="Texto adicional. El nombre, el NIT y la dirección ya salen impresos desde los datos del negocio: no hace falta repetirlos."
      />
      <Campo
        label="Pie del tiquete"
        name="receiptFooter"
        defaultValue={operacion.receiptFooter ?? ""}
        ayuda="Va al final, después del total."
      />

      <Enviar>Guardar configuración</Enviar>
    </form>
  );
}

export function FormularioModulos({
  mesasHabilitado,
  deliveryEnabled,
  deliveryFeeCop = 0,
  inventoryEnabled,
  recipesEnabled,
}: {
  mesasHabilitado: boolean;
  deliveryEnabled: boolean;
  deliveryFeeCop?: number;
  inventoryEnabled: boolean;
  recipesEnabled: boolean;
}) {
  const [estado, accion] = useActionState(guardarModulos, ESTADO_INICIAL);
  const [invChecked, setInvChecked] = useState(inventoryEnabled);
  const [delivChecked, setDelivChecked] = useState(deliveryEnabled);

  return (
    <form action={accion} className="space-y-4">
      <Resultado estado={estado} />

      <Casilla
        name="mesasHabilitado"
        label="Este negocio sienta mesas"
        defaultChecked={mesasHabilitado}
        ayuda={
          mesasHabilitado
            ? "Apagalo si es un mostrador sin mesas: el Salón desaparece y la pantalla de entrada pasa a ser POS."
            : "Está apagado: la pantalla de entrada es POS, no Salón."
        }
      />

      <div className="space-y-3 rounded-lg border border-[var(--linea-20)] bg-[var(--tarjeta-fondo)] p-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="deliveryEnabled"
            checked={delivChecked}
            onChange={(e) => setDelivChecked(e.target.checked)}
            className="accent-primary mt-0.5 size-4 cursor-pointer"
          />
          <div className="space-y-0.5">
            <span className="font-semibold text-sm block">Este negocio reparte a domicilio</span>
            <span className="text-muted-foreground text-xs block">
              Si lo apagás, &apos;Domicilio&apos; deja de ofrecerse como tipo de pedido en el POS y en el Menú QR.
            </span>
          </div>
        </label>

        {delivChecked && (
          <div className="pt-2 pl-6 border-t border-[var(--linea-15)]">
            <Campo
              name="deliveryFeeCop"
              label="Valor o tarifa fija del domicilio"
              defaultValue={deliveryFeeCop > 0 ? formatCop(deliveryFeeCop, { symbol: false }) : "0"}
              inputMode="numeric"
              placeholder="0"
              ayuda="Se sumará de forma automática al total del pedido cuando sea a domicilio a través del POS o del menú QR."
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="inventoryEnabled"
            checked={invChecked}
            onChange={(e) => setInvChecked(e.target.checked)}
            className="size-4 mt-0.5 rounded border-[var(--linea-30)] accent-brand cursor-pointer"
          />
          <div className="space-y-0.5">
            <span className="font-semibold text-sm text-foreground block">
              Gestión de Inventario (Insumos, Entradas por Factura y Stock)
            </span>
            <span className="text-muted-foreground text-xs block">
              Al activarlo, aparece el módulo de Inventario en el menú superior para propietarios, administradores y cajeros.
            </span>
          </div>
        </label>

        {invChecked && !inventoryEnabled && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning-soft flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" />
            <div className="space-y-0.5">
              <strong className="font-bold text-foreground block">
                ⚠️ Reinicio de stock al activar inventario
              </strong>
              <span>
                Al guardar con el inventario activado, todos los stocks (insumos y productos) se establecerán en <strong>0</strong> para que puedas registrar tu inventario inicial real y evitar saldos negativos por ventas anteriores.
              </span>
            </div>
          </div>
        )}
      </div>

      <Casilla
        name="recipesEnabled"
        label="Prepara productos con Recetas y Escandallos"
        defaultChecked={recipesEnabled}
        ayuda="Permite definir recetas/ingredientes por producto para descontar insumos automáticamente por cada venta."
      />

      <Enviar>Guardar módulos</Enviar>
    </form>
  );
}

export type TurneroSettingsProps = {
  turneroMediaMode: string;
  turneroImages: string;
  turneroImageIntervalSeconds: number;
  turneroYoutubeUrl: string | null;
  turneroBadgePosition: string;
};

export function FormularioTurnero({ settings }: { settings: TurneroSettingsProps }) {
  const [estado, accion] = useActionState(guardarTurneroSettings, ESTADO_INICIAL);
  const [modo, setModo] = useState(settings.turneroMediaMode);
  const [images, setImages] = useState(settings.turneroImages ?? "");
  const [interval, setIntervalVal] = useState(settings.turneroImageIntervalSeconds ?? 10);
  const [youtubeUrl, setYoutubeUrl] = useState(settings.turneroYoutubeUrl ?? "");
  const [copiado, setCopiado] = useState(false);

  const copiarUrl = () => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/turnero`;
      navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Caja con el Enlace Directo al Turnero del Salón */}
      <div className="p-4 rounded-xl border border-brand/20 bg-brand/5 dark:bg-brand/10 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              Enlace del Turnero para la TV del Salón
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Abrí esta URL en el navegador de la TV o tablet del negocio para proyectar los turnos listos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copiarUrl}
              className="text-xs h-8"
            >
              {copiado ? "✓ ¡Copiado!" : "Copiar Enlace"}
            </Button>
            <Button
              asChild
              variant="default"
              size="sm"
              className="text-xs h-8 bg-brand hover:bg-brand/90 text-brand-foreground"
            >
              <a href="/turnero" target="_blank" rel="noopener noreferrer">
                Abrir Turnero ↗
              </a>
            </Button>
          </div>
        </div>
      </div>

      <form action={accion} className="space-y-4">
        <Resultado estado={estado} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="turneroMediaMode">Fondo / Multimedia del Televisor</Label>
            <select
              id="turneroMediaMode"
              name="turneroMediaMode"
              value={modo}
              onChange={(e) => setModo(e.target.value)}
              className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
            >
              <option value="NONE">Sin multimedia (Fondo Oscuro Estándar)</option>
              <option value="IMAGES">Carrusel de Imágenes Publicitarias</option>
              <option value="YOUTUBE">Video de YouTube (Embed)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="turneroBadgePosition">Posición del Recuadro de Turnos Listos</Label>
            <select
              id="turneroBadgePosition"
              name="turneroBadgePosition"
              defaultValue={settings.turneroBadgePosition}
              className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
            >
              <option value="TOP_RIGHT">Esquina Superior Derecha</option>
              <option value="TOP_LEFT">Esquina Superior Izquierda</option>
            </select>
          </div>
        </div>

        {/* Inputs Ocultos para asegurar transmisión continua a FormData */}
        {modo !== "IMAGES" && (
          <>
            <input type="hidden" name="turneroImages" value={images} />
            <input type="hidden" name="turneroImageIntervalSeconds" value={interval} />
          </>
        )}
        {modo !== "YOUTUBE" && (
          <input type="hidden" name="turneroYoutubeUrl" value={youtubeUrl} />
        )}

        {modo === "IMAGES" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="space-y-1.5">
              <Label htmlFor="turneroImages">URLs de Imágenes Publicitarias (Una por línea o separadas por coma)</Label>
              <textarea
                id="turneroImages"
                name="turneroImages"
                rows={3}
                value={images}
                onChange={(e) => setImages(e.target.value)}
                placeholder="https://ejemplo.com/promo1.jpg&#10;https://ejemplo.com/promo2.jpg"
                className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm focus-visible:ring-3 focus-visible:outline-none font-mono text-xs"
              />
              <p className="text-muted-foreground text-xs">
                Ingresá enlaces directos de imágenes promocionales para proyectar en el salón.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="turneroImageIntervalSeconds">Intervalo de rotación de imágenes (segundos)</Label>
              <Input
                id="turneroImageIntervalSeconds"
                name="turneroImageIntervalSeconds"
                type="number"
                min={3}
                max={300}
                value={interval}
                onChange={(e) => setIntervalVal(Number(e.target.value))}
              />
              <p className="text-muted-foreground text-xs">
                Cada cuántos segundos cambia automáticamente la imagen del carrusel.
              </p>
            </div>
          </div>
        )}

        {modo === "YOUTUBE" && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="space-y-1.5">
              <Label htmlFor="turneroYoutubeUrl">Enlace o ID del Video de YouTube</Label>
              <Input
                id="turneroYoutubeUrl"
                name="turneroYoutubeUrl"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
              />
              <p className="text-muted-foreground text-xs">
                El video se reproducirá automáticamente en bucle como fondo del turnero.
              </p>
            </div>
          </div>
        )}

        <Enviar>Guardar configuración de turnero</Enviar>
      </form>
    </div>
  );
}

export type FormularioLicenciaProps = {
  suscripcion: {
    id: string;
    status: string;
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
  } | null;
  timeZone: string;
  /** Cuántas sedes cubre la licencia de la cuenta. Es lo que decide el precio. */
  sedes: number;
  /** La lista vigente. Es la única fuente del precio, para todos por igual. */
  lista: ListaDePrecios | null;
  /** La lista de siempre, para poder decir de cuánto bajó una promoción. */
  base: ListaDePrecios | null;
  /** La promoción que está corriendo, si hay alguna. */
  promo: ListaDePrecios | null;
};

export function FormularioLicencia({
  suscripcion,
  timeZone,
  sedes,
  lista,
  base,
  promo,
}: FormularioLicenciaProps) {
  const [openModal, setOpenModal] = useState(false);
  const [estadoSolicitud, accionSolicitud] = useActionState(solicitarSedeAdicional, ESTADO_INICIAL);

  /**
   * Se cotiza acá con la MISMA función que el checkout y que la portada.
   *
   * Antes esta pantalla mostraba `suscripcion.priceCop` a pelo y los planes
   * estaban escritos a mano en el JSX, con números que ya ni siquiera coincidían
   * con lo que el sistema cobra: decía "$270.000 semestral" y "$480.000 anual"
   * cuando el descuento son meses de regalo (seis se pagan cinco, doce se pagan
   * diez), o sea $250.000 y $500.000.
   */
  const cotizaciones = lista ? cotizarTodas(lista, sedes) : null;
  const mensual = cotizaciones?.find((c) => c.periodicidad === "MENSUAL") ?? null;
  const tarifaUna = lista ? cotizarTodas(lista, 1) : null;
  const tarifaDos = lista ? cotizarTodas(lista, 2) : null;
  /** El mensual es el mismo en las tres periodicidades: lo que cambia es el total. */
  const mensualDe = (tarifa: typeof cotizaciones) =>
    tarifa?.find((c) => c.periodicidad === "MENSUAL")?.mensualCop ?? null;
  const totalDe = (tarifa: typeof cotizaciones, meses: number) =>
    tarifa?.find((c) => c.mesesOtorgados === meses)?.totalCop ?? null;
  const mesesGratisDe = (meses: number) =>
    cotizaciones?.find((c) => c.mesesOtorgados === meses)?.mesesGratis ?? null;
  const cop = (valor: number | null) => (valor === null ? "—" : formatCop(valor));

  const ESTADO_MAP: Record<string, { texto: string; variante: "default" | "secondary" | "destructive" | "outline" }> = {
    PRUEBA: { texto: "En Prueba Gratis", variante: "secondary" },
    ACTIVA: { texto: "Al Día / Activa", variante: "default" },
    VENCIDA: { texto: "Vencida", variante: "destructive" },
    SUSPENDIDA: { texto: "Suspendida", variante: "destructive" },
    CANCELADA: { texto: "Cancelada", variante: "destructive" },
  };

  const infoEstado = suscripcion ? (ESTADO_MAP[suscripcion.status] ?? { texto: suscripcion.status, variante: "outline" }) : null;
  const dias = suscripcion ? diasParaElCorte(suscripcion) : null;
  const vence = suscripcion ? (suscripcion.currentPeriodEnd ?? suscripcion.trialEndsAt) : null;

  return (
    <div className="space-y-6">
      <Resultado estado={estadoSolicitud} />

      {/* Tarjeta resumen de la licencia del negocio */}
      <div className="rounded-xl border border-border p-4 bg-card/60 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Estado Actual de la Licencia</span>
            <span className="text-lg font-bold text-foreground">
              {suscripcion?.status === "PRUEBA"
                ? "$0 COP (Prueba Gratis de 7 días)"
                : suscripcion
                ? `${cop(mensual?.mensualCop ?? null)} / mes`
                : "Sin suscripción"}
            </span>
            {suscripcion?.status !== "PRUEBA" && sedes > 1 && (
              <span className="text-xs text-muted-foreground block">
                Por tus <span className="numeral">{sedes}</span> sedes, en un solo cobro.
              </span>
            )}
          </div>

          {infoEstado && (
            <Badge variant={infoEstado.variante} className="text-xs font-bold px-3 py-1">
              {infoEstado.texto}
            </Badge>
          )}
        </div>

        {base && (
          <AvisoPromocion promo={promo} base={base} sedes={sedes} timeZone={timeZone} />
        )}

        {suscripcion && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
            {vence && (
              <div>
                <dt className="text-muted-foreground">
                  {suscripcion.status === "PRUEBA" ? "Fin del periodo de prueba:" : "Fecha de vencimiento:"}
                </dt>
                <dd className="numeral font-medium text-foreground">{formatDayInTimeZone(vence, timeZone)}</dd>
              </div>
            )}
            {dias !== null && (
              <div>
                <dt className="text-muted-foreground">Días de servicio restantes:</dt>
                <dd className={`numeral font-bold ${dias <= 3 ? "text-destructive" : "text-success-soft"}`}>
                  {dias > 0 ? `${dias} días` : "Servicio suspendido (renová para trabajar)"}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs font-semibold">
            <Link href="/facturacion">
              💳 Pagar / Adelantar Meses con Descuento
            </Link>
          </Button>

          <Dialog open={openModal} onOpenChange={setOpenModal}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs font-semibold">
                🏢 Pedir Sede Adicional
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Solicitar Sede Adicional o Cambio de Plan</DialogTitle>
              </DialogHeader>

              {suscripcion?.status === "PRUEBA" ? (
                <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 text-warning-soft text-xs space-y-2">
                  <span className="font-bold block">⚠️ Plan de Prueba Gratuita (7 Días)</span>
                  <p className="leading-relaxed">
                    Las sedes adicionales únicamente pueden crearse tras adquirir una licencia de pago activa.
                    Realiza el pago de tu licencia para desbloquear la adición de múltiples sucursales con prorrateo.
                  </p>
                </div>
              ) : (
                <form action={accionSolicitud} className="space-y-4 pt-2">
                  <Resultado estado={estadoSolicitud} />

                  <div className="space-y-1.5">
                    <Label htmlFor="cantidadSedes" className="text-xs font-bold">¿Cuántas sucursales o sedes necesitas?</Label>
                    <select
                      id="cantidadSedes"
                      name="cantidadSedes"
                      defaultValue="2"
                      className="w-full h-9 rounded-md border border-input px-3 text-xs bg-background"
                    >
                      <option value="2">
                        2 Sucursales ({cop(mensualDe(tarifaDos))} COP / mes)
                      </option>
                      <option value="3">3 o más Sucursales (Cotización personalizada multi-sede)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="periodoMeses" className="text-xs font-bold">Periodo de facturación preferido</Label>
                    <select
                      id="periodoMeses"
                      name="periodoMeses"
                      defaultValue="1"
                      className="w-full h-9 rounded-md border border-input px-3 text-xs bg-background"
                    >
                      <option value="1">
                        Mensual ({cop(mensualDe(tarifaUna))} / 1 sede &middot;{" "}
                        {cop(mensualDe(tarifaDos))} / 2 sedes)
                      </option>
                      <option value="6">
                        Semestral 6 meses ({cop(totalDe(tarifaUna, 6))} / 1 sede &middot;{" "}
                        {cop(totalDe(tarifaDos, 6))} / 2 sedes)
                      </option>
                      <option value="12">
                        Anual 12 meses ({cop(totalDe(tarifaUna, 12))} / 1 sede &middot;{" "}
                        {cop(totalDe(tarifaDos, 12))} / 2 sedes)
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="observaciones" className="text-xs font-bold">Observaciones o nombre de la nueva sede</Label>
                    <Input
                      id="observaciones"
                      name="observaciones"
                      placeholder="Ej. Nombre de la nueva sede, dirección estimada o consulta..."
                      className="text-xs"
                    />
                  </div>

                  <Button type="submit" className="w-full bg-brand text-brand-foreground text-xs font-bold">
                    Enviar Solicitud de Nueva Sede
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Cuadro informativo de tarifas de Platlia */}
      <div className="rounded-xl border border-border/80 p-4 bg-muted/30 space-y-3">
        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Planes Oficiales de Licencia Platlia</h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-border bg-card">
            <span className="font-bold text-foreground block">1 Sucursal</span>
            <span className="text-base font-extrabold text-success-soft block numeral">
              {cop(mensualDe(tarifaUna))} COP / mes
            </span>
            <span className="text-rotulo text-muted-foreground">Todos los módulos incluidos (Salón, POS, Cocina, Caja, Inventario, Recetas e Informes).</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-card">
            <span className="font-bold text-foreground block">2 Sucursales</span>
            <span className="text-base font-extrabold text-success-soft block numeral">
              {cop(mensualDe(tarifaDos))} COP / mes
            </span>
            <span className="text-rotulo text-muted-foreground">
              {mensualDe(tarifaUna) !== null && mensualDe(tarifaDos) !== null
                ? `Ahorro de ${formatCop(mensualDe(tarifaUna)! * 2 - mensualDe(tarifaDos)!)} COP/mes frente a dos licencias sueltas.`
                : "La segunda sede entra a tarifa reducida."}
            </span>
          </div>
        </div>

        {/* El descuento son MESES DE REGALO, no un porcentaje: seis se pagan cinco
            y doce se pagan diez. Un porcentaje sobre pesos enteros deja centavos
            que hay que redondear en algún lado, y "un mes de regalo" se explica
            sin calculadora. */}
        <div className="p-3 rounded-lg border border-brand/30 bg-brand/5 text-xs space-y-1">
          <span className="font-bold text-brand block">✨ Descuentos por Pago Anticipado</span>
          <p className="text-muted-foreground">
            • <strong>6 Meses (Semestral):</strong> pagás{" "}
            <span className="numeral">{6 - (mesesGratisDe(6) ?? 0)}</span> y usás{" "}
            <span className="numeral">6</span> ({cop(totalDe(tarifaUna, 6))} para 1 sede /{" "}
            {cop(totalDe(tarifaDos, 6))} para 2 sedes).
            <br />• <strong>12 Meses (Anual):</strong> pagás{" "}
            <span className="numeral">{12 - (mesesGratisDe(12) ?? 0)}</span> y usás{" "}
            <span className="numeral">12</span> ({cop(totalDe(tarifaUna, 12))} para 1 sede /{" "}
            {cop(totalDe(tarifaDos, 12))} para 2 sedes).
            <br />• <strong>3 o más Sucursales:</strong> Contactate con nuestro equipo para definir precio corporativo especial.
          </p>
        </div>
      </div>
    </div>
  );
}

export type QrMenuSettingsProps = {
  qrMenuEnabled: boolean;
  qrMenuBgMode: string;
  qrMenuBgColor: string;
  qrMenuBgGradient: string;
  qrMenuBgImageUrl: string | null;
  qrMenuLogoUrl: string | null;
  qrMenuHeaderTitle: string | null;
  qrMenuHeaderSubtitle: string | null;
  qrMenuAccent: string;
  slug: string;
  mesas: { id: string; name: string }[];
  deliveryEnabled?: boolean;
};

// ─── Temas de Marca Listos en 1 Clic (Dark Kitchen-Fire & Gastronómicos) ───
const BRAND_THEMES = [
  {
    id: "dark-kitchen",
    name: "Dark Kitchen-Fire",
    tag: "Oficial Platlia",
    icon: "🔥",
    mode: "SOLID",
    bgColor: "#171512",
    bgGradient: "linear-gradient(135deg, #171512 0%, #2A1A14 60%, #3D1C14 100%)",
    title: "Menú Digital & Domicilios",
    subtitle: "Cocina en tiempo real · Despacho inmediato",
    accent: "#FF4E1F",
  },
  {
    id: "espresso-roble",
    name: "Espresso & Roble",
    tag: "Café / Brunch",
    icon: "☕",
    mode: "GRADIENT",
    bgColor: "#1A130E",
    bgGradient: "linear-gradient(135deg, #140E0A 0%, #2A1D15 50%, #473022 100%)",
    title: "Café, Brunch & Repostería",
    subtitle: "Pide directo a tu mesa o a domicilio",
    accent: "#D97706",
  },
  {
    id: "parrilla-carbon",
    name: "Parrilla & Carbón",
    tag: "Asador / Carnes",
    icon: "🥩",
    mode: "GRADIENT",
    bgColor: "#150F0D",
    bgGradient: "linear-gradient(135deg, #120B09 0%, #2C120C 50%, #5E1A0C 100%)",
    title: "Parrilla, Carnes & Cortes",
    subtitle: "Sabor ahumado artesanal directo al comensal",
    accent: "#EF4444",
  },
  {
    id: "gastrobar-esmeralda",
    name: "Gastrobar & Botánica",
    tag: "Cocteles / Autor",
    icon: "🌿",
    mode: "GRADIENT",
    bgColor: "#0D1715",
    bgGradient: "linear-gradient(135deg, #091210 0%, #122B26 50%, #1B4D43 100%)",
    title: "Coctelería & Cocina de Autor",
    subtitle: "Experiencia gourmet y pedidos rápidos",
    accent: "#10B981",
  },
  {
    id: "trattoria-pizza",
    name: "Trattoria & Cava",
    tag: "Italiana / Pizza",
    icon: "🍕",
    mode: "GRADIENT",
    bgColor: "#170F11",
    bgGradient: "linear-gradient(135deg, #120A0C 0%, #291218 50%, #4D1826 100%)",
    title: "Pizzas Artesanales & Pastas",
    subtitle: "Masa madre y recetas tradicionales",
    accent: "#F43F5E",
  },
  {
    id: "titanio-minimal",
    name: "Titanio & Obsidiana",
    tag: "Minimalista",
    icon: "🌑",
    mode: "GRADIENT",
    bgColor: "#0F1115",
    bgGradient: "linear-gradient(135deg, #0A0C0E 0%, #171B22 50%, #252D38 100%)",
    title: "Carta Digital Seleccionada",
    subtitle: "Explora nuestros platos y bebidas exclusivas",
    accent: "#38BDF8",
  },
];

// ─── Paleta de Colores Sólidos Gastronómicos ───
/** Los acentos de los seis temas de marca, para elegir uno sin abrir el tema entero. */
const ACENTOS = [
  { name: "Brasa Platlia", hex: "#FF4E1F" },
  { name: "Ámbar Espresso", hex: "#D97706" },
  { name: "Rojo Parrilla", hex: "#EF4444" },
  { name: "Verde Esmeralda", hex: "#10B981" },
  { name: "Rosa Trattoria", hex: "#F43F5E" },
  { name: "Azul Titanio", hex: "#38BDF8" },
];

const COLOR_PRESETS = [
  { name: "Hierro Fundido", hex: "#171512", desc: "Oscuro carbón de cocina" },
  { name: "Brasa Ahumada", hex: "#2B140E", desc: "Cálido rojizo fuego" },
  { name: "Café Tostado", hex: "#1F150F", desc: "Marrón espresso intenso" },
  { name: "Esmeralda Noble", hex: "#0F211D", desc: "Verde bosque botánico" },
  { name: "Azul Medianoche", hex: "#0F1724", desc: "Zafiro oscuro profundo" },
  { name: "Borgoña Gourmet", hex: "#240E16", desc: "Ciruela vino selecto" },
  { name: "Oliva Seco", hex: "#181D12", desc: "Verde oliva artesanal" },
  { name: "Grafito Puro", hex: "#1E1E1E", desc: "Gris neutro mate" },
];

// ─── Degradados Atmosféricos de Alto Contraste ───
const GRADIENT_PRESETS = [
  { name: "Brasa & Hierro", value: "linear-gradient(135deg, #171512 0%, #2D1610 50%, #4A1D13 100%)" },
  { name: "Espresso & Ámbar", value: "linear-gradient(135deg, #140E0A 0%, #261910 50%, #422817 100%)" },
  { name: "Esmeralda & Menta", value: "linear-gradient(135deg, #0A1412 0%, #112923 50%, #1A4238 100%)" },
  { name: "Terracota Andino", value: "linear-gradient(135deg, #17120E 0%, #301E14 50%, #572F1C 100%)" },
  { name: "Zafiro Cóctel", value: "linear-gradient(135deg, #0A1017 0%, #122030 50%, #1A344D 100%)" },
  { name: "Cava & Rubí", value: "linear-gradient(135deg, #140A0D 0%, #261019 50%, #421627 100%)" },
  { name: "Noche Dorada", value: "linear-gradient(135deg, #12100A 0%, #241D10 50%, #3D3017 100%)" },
  { name: "Titanio & Acero", value: "linear-gradient(135deg, #0D0E12 0%, #191D24 50%, #28303B 100%)" },
];

// ─── Texturas y Patrones Gastronómicos (Data URI SVG) ───
const TEXTURE_PRESETS = [
  {
    name: "Parrilla / Cuadrícula",
    icon: "▦",
    url: "data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h24v24H0z' fill='%23171512'/%3E%3Cpath d='M24 0H0v1h24V0zM0 24V0h1v24H0z' fill='%23EDE7DA' fill-opacity='0.05'/%3E%3C/svg%3E",
  },
  {
    name: "Puntos de Comanda",
    icon: "⁘",
    url: "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='20' height='20' fill='%23171512'/%3E%3Ccircle cx='10' cy='10' r='1.2' fill='%23EDE7DA' fill-opacity='0.08'/%3E%3C/svg%3E",
  },
  {
    name: "Malla Diagonal",
    icon: "▨",
    url: "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='20' height='20' fill='%23171512'/%3E%3Cpath d='M0 20L20 0H10L0 10V20zM10 20L20 10V0L0 20H10z' fill='%23EDE7DA' fill-opacity='0.04'/%3E%3C/svg%3E",
  },
  {
    name: "Líneas Térmicas",
    icon: "☰",
    url: "data:image/svg+xml,%3Csvg width='32' height='16' viewBox='0 0 32 16' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='32' height='16' fill='%23171512'/%3E%3Cpath d='M0 8h32M0 16h32' stroke='%23EDE7DA' stroke-opacity='0.06' stroke-width='1' stroke-dasharray='3 3'/%3E%3C/svg%3E",
  },
];

// ─── Presets Rápidos de Textos Gastronómicos ───
const TITLE_PRESETS = [
  "Menú Digital & Domicilios",
  "Parrilla, Carnes & Cortes",
  "Hamburguesas & Cervezas",
  "Pizzas Artesanales & Pastas",
  "Café de Especialidad & Brunch",
  "Cocteles & Cocina de Autor",
];

const SUBTITLE_PRESETS = [
  "¡Pide directo y recibe tus platos calientes!",
  "Envíos gratis por compras superiores a $50.000",
  "Escanea el QR para pedir a tu mesa sin esperas",
  "Cocina abierta hoy hasta las 11:00 p.m.",
  "Preparado en el momento con ingredientes frescos",
  "Paga fácil con Nequi, Daviplata o Tarjeta",
];

export function FormularioQrMenu({ settings }: { settings: QrMenuSettingsProps }) {
  const [estado, accion] = useActionState(guardarQrMenuSettings, ESTADO_INICIAL);
  const [habilitado, setHabilitado] = useState(settings.qrMenuEnabled);
  const [tabActiva, setTabActiva] = useState<"tema" | "textos" | "qrs">("tema");

  // Estado visual
  const [bgMode, setBgMode] = useState(settings.qrMenuBgMode || "SOLID");
  const [bgColor, setBgColor] = useState(settings.qrMenuBgColor || "#171512");
  const [bgGradient, setBgGradient] = useState(
    settings.qrMenuBgGradient || "linear-gradient(135deg, #171512 0%, #2A1A14 60%, #3D1C14 100%)",
  );
  const [bgImageUrl, setBgImageUrl] = useState(settings.qrMenuBgImageUrl || "");
  const [logoUrl, setLogoUrl] = useState(settings.qrMenuLogoUrl || "");
  const [headerTitle, setHeaderTitle] = useState(settings.qrMenuHeaderTitle || "Menú Digital & Domicilios");
  const [headerSubtitle, setHeaderSubtitle] = useState(
    settings.qrMenuHeaderSubtitle || "Pide directo y recibe tus platos calientes",
  );
  const [accent, setAccent] = useState(settings.qrMenuAccent || "#FF4E1F");

  // Estado interactivo de UI
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoFondo, setSubiendoFondo] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [previewModo, setPreviewModo] = useState<"domicilio" | "mesa">("domicilio");
  const [tarjetaImprimir, setTarjetaImprimir] = useState<{
    identificador: string;
    subtitulo: string;
    url: string;
  } | null>(null);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://platlia.com";
  const urlDomicilio = `${appUrl}/m/${settings.slug}?tipo=domicilio`;

  // Aplicar tema prediseñado en 1 solo clic
  const aplicarTema = (tema: typeof BRAND_THEMES[0]) => {
    setBgMode(tema.mode);
    setBgColor(tema.bgColor);
    setBgGradient(tema.bgGradient);
    setHeaderTitle(tema.title);
    setHeaderSubtitle(tema.subtitle);
    // El acento venía definido en cada preset desde el principio y se descartaba
    // acá: por eso los seis temas cambiaban el fondo y ninguno el botón.
    setAccent(tema.accent);
  };

  const copiarEnlace = (url: string, id: string) => {
    if (typeof navigator !== "undefined") {
      void navigator.clipboard.writeText(url);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2500);
    }
  };

  const manejarSubidaArchivo = async (
    e: React.ChangeEvent<HTMLInputElement>,
    tipo: "logo" | "fondo",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (tipo === "logo") setSubiendoLogo(true);
    else setSubiendoFondo(true);

    try {
      const res = await subirImagenQrMenu(undefined, { tipo, file });
      if (res.ok && res.data?.url) {
        if (tipo === "logo") {
          setLogoUrl(res.data.url);
        } else {
          setBgImageUrl(res.data.url);
          setBgMode("PATTERN_IMAGE");
        }
      }
    } finally {
      if (tipo === "logo") setSubiendoLogo(false);
      else setSubiendoFondo(false);
    }
  };

  const ejecutarImpresion = (datos: { identificador: string; subtitulo: string; url: string }) => {
    if (typeof window === "undefined") return;

    const win = window.open("", "_blank", "width=480,height=680");
    if (!win) return;

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(datos.url)}`;
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" class="logo" alt="Logo" />`
      : `<div class="logo-badge">P</div>`;

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Imprimir QR - ${datos.identificador}</title>
        <style>
          @page { size: portrait; margin: 8mm; }
          body {
            margin: 0;
            padding: 16px;
            background: #ffffff;
            color: #171512;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 90vh;
          }
          .card {
            width: 290px;
            border: 3px solid #171512;
            border-radius: 20px;
            padding: 24px;
            background: #EDE7DA;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-shadow: 0 12px 30px rgba(0,0,0,0.12);
            margin: 0 auto;
          }
          .logo {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #FF4E1F;
            margin-bottom: 10px;
          }
          .logo-badge {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            background: #171512;
            color: #EDE7DA;
            font-weight: 900;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
            border: 2px solid #FF4E1F;
          }
          .title {
            font-size: 20px;
            font-weight: 900;
            margin: 0;
            color: #171512;
            line-height: 1.15;
            text-transform: uppercase;
          }
          .subtitle {
            font-size: 11.5px;
            color: #555047;
            margin: 4px 0 14px 0;
          }
          .badge {
            background: #171512;
            color: #FF4E1F;
            font-weight: 900;
            font-size: 13.5px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            padding: 6px 16px;
            border-radius: 10px;
            margin-bottom: 14px;
          }
          .qr-frame {
            padding: 12px;
            border: 2px solid #171512;
            border-radius: 16px;
            background: #ffffff;
            margin-bottom: 12px;
          }
          .qr-img {
            width: 190px;
            height: 190px;
            display: block;
          }
          .instructions {
            font-size: 13px;
            font-weight: 800;
            color: #171512;
            margin: 0 0 3px 0;
          }
          .sub-instructions {
            font-size: 11px;
            color: #555047;
            margin: 0;
          }
          .footer-url {
            font-size: 9.5px;
            font-family: monospace;
            color: #777063;
            margin-top: 14px;
            border-top: 1px dashed #C9C2AF;
            padding-top: 6px;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="card">
          ${logoHtml}
          <h1 class="title">${headerTitle || "Menú Digital"}</h1>
          <p class="subtitle">${headerSubtitle || "Pide directo desde tu celular"}</p>
          <div class="badge">${datos.identificador}</div>
          <div class="qr-frame">
            <img id="qr-image" src="${qrImageUrl}" class="qr-img" alt="QR Code" />
          </div>
          <p class="instructions">📱 Escaneá con tu cámara</p>
          <p class="sub-instructions">${datos.subtitulo}</p>
          <div class="footer-url">${datos.url}</div>
        </div>
        <script>
          const img = document.getElementById('qr-image');
          if (img.complete) {
            window.print();
          } else {
            img.onload = () => window.print();
          }
        </script>
      </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // Cálculo del estilo de fondo en vivo
  const previewBackgroundStyle = (() => {
    if (bgMode === "PATTERN_IMAGE" && bgImageUrl) {
      return { backgroundImage: `url(${bgImageUrl})`, backgroundRepeat: "repeat" };
    }
    if (bgMode === "GRADIENT") {
      return { background: bgGradient };
    }
    return { backgroundColor: bgColor };
  })();

  return (
    <div className="space-y-8">
      {/* ─── Encabezado Principal & Interruptor Global ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[var(--linea-30)] bg-[var(--panel-bg)] p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[var(--brasa)] animate-pulse" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--brasa)]">
              SITIO WEB DE DOMICILIOS & MENÚ QR
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-display uppercase tracking-tight text-[var(--papel)]">
            Personalización de la Experiencia del Cliente
          </h2>
          <p className="text-xs sm:text-sm text-[var(--linea)] max-w-xl">
            Configura el aspecto visual de la carta web que tus clientes verán al escanear los códigos QR en mesa o al pedir domicilios por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center bg-[var(--panel-2)] border border-[var(--linea-30)] rounded-xl px-4 py-2.5">
          <span className="text-xs font-bold text-[var(--papel)]">
            {habilitado ? "🟢 Servicio Activo" : "⚪ Servicio Desactivado"}
          </span>
          <input
            type="checkbox"
            checked={habilitado}
            onChange={(e) => setHabilitado(e.target.checked)}
            className="size-5 rounded border-[var(--linea-30)] text-[var(--brasa)] focus:ring-[var(--brasa)] cursor-pointer"
          />
        </div>
      </div>

      {/* ─── Navegación por Pestañas ─── */}
      <div className="flex border-b border-dashed border-[var(--linea-30)] gap-2 pb-2 overflow-x-auto">
        {[
          { id: "tema", label: "🎨 1. Identidad Visual & Tema", desc: "Colores, degradados y logo" },
          { id: "textos", label: "🛵 2. Domicilios & Mensajes", desc: "Tiempos, títulos y textos" },
          { id: "qrs", label: "🖨️ 3. Códigos QR & Enlaces", desc: "Mesas, tirillas e impresión" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTabActiva(tab.id as typeof tabActiva)}
            className={cn(
              "flex flex-col text-left px-4 py-2.5 rounded-xl border transition-all shrink-0 cursor-pointer",
              tabActiva === tab.id
                ? "border-[var(--brasa)] bg-[var(--panel-2)] text-[var(--papel)] shadow-md"
                : "border-transparent text-[var(--linea)] hover:text-[var(--papel)] hover:bg-[var(--panel-2)]/50",
            )}
          >
            <span className="text-xs sm:text-sm font-bold">{tab.label}</span>
            <span className="text-rotulo text-[var(--linea)] opacity-80">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* ─── Grilla Principal: Formulario Interactivo (7 cols) + Simulador Móvil (5 cols) ─── */}
      <div className="grid gap-8 lg:grid-cols-12 items-start">
        
        {/* Columna Izquierda: Opciones Interactivas sin código */}
        <form action={accion} className="space-y-6 lg:col-span-7">
          <Resultado estado={estado} />

          <input type="hidden" name="qrMenuEnabled" value={habilitado ? "on" : "off"} />
          <input type="hidden" name="qrMenuBgMode" value={bgMode} />
          <input type="hidden" name="qrMenuBgColor" value={bgColor} />
          <input type="hidden" name="qrMenuBgGradient" value={bgGradient} />
          <input type="hidden" name="qrMenuBgImageUrl" value={bgImageUrl} />
          <input type="hidden" name="qrMenuLogoUrl" value={logoUrl} />
          <input type="hidden" name="qrMenuHeaderTitle" value={headerTitle} />
          <input type="hidden" name="qrMenuHeaderSubtitle" value={headerSubtitle} />
          <input type="hidden" name="qrMenuAccent" value={accent} />

          {/* ══════════════════════════════════════════════════════════════════
              PESTAÑA 1: IDENTIDAD VISUAL & TEMA
              ══════════════════════════════════════════════════════════════════ */}
          {tabActiva === "tema" && (
            <div className="space-y-6">
              
              {/* Temas Rápidos Listos en 1 Clic */}
              <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-[var(--papel)] flex items-center gap-2">
                      <span>✨ Temas Gastronómicos Listos (1 Clic)</span>
                    </h3>
                    <p className="text-xs text-[var(--linea)]">
                      Selecciona un estilo profesional pre-configurado para tu tipo de restaurante o bar.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {BRAND_THEMES.map((tema) => (
                    <button
                      key={tema.id}
                      type="button"
                      onClick={() => aplicarTema(tema)}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition-all hover:scale-[1.02] flex flex-col justify-between min-h-[95px] relative overflow-hidden group cursor-pointer",
                        bgColor === tema.bgColor || bgGradient === tema.bgGradient
                          ? "border-[var(--brasa)] ring-2 ring-[var(--brasa)]/30 bg-[var(--panel-2)]"
                          : "border-[var(--linea-30)] bg-[var(--panel-2)]/50 hover:bg-[var(--panel-2)]",
                      )}
                    >
                      {/* Fondo miniatura */}
                      <div
                        className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none"
                        style={{ background: tema.mode === "GRADIENT" ? tema.bgGradient : tema.bgColor }}
                      />

                      <div className="flex items-center justify-between z-10">
                        <span className="text-lg">{tema.icon}</span>
                        <span className="text-rotulo font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--tinta)]/80 text-[var(--papel)] border border-[var(--linea-30)]">
                          {tema.tag}
                        </span>
                      </div>

                      <div className="z-10 pt-2">
                        <span className="font-bold text-xs text-[var(--papel)] block leading-tight">
                          {tema.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Modo de Fondo */}
              <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-6 space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold uppercase tracking-wider text-[var(--linea)]">
                    Estilo de Fondo de Pantalla
                  </Label>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { id: "SOLID", label: "🎨 Color Sólido" },
                      { id: "GRADIENT", label: "🌈 Degradado" },
                      { id: "PATTERN_IMAGE", label: "🖼️ Textura / Patrón" },
                    ].map((modo) => (
                      <button
                        key={modo.id}
                        type="button"
                        onClick={() => setBgMode(modo.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-xs font-bold transition-all text-center cursor-pointer",
                          bgMode === modo.id
                            ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] shadow-md"
                            : "bg-[var(--panel-2)] text-[var(--linea)] hover:text-[var(--papel)] border-[var(--linea-30)]",
                        )}
                      >
                        {modo.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vista: Colores Sólidos en Cuadrícula */}
                {bgMode === "SOLID" && (
                  <div className="space-y-3 pt-3 border-t border-dashed border-[var(--linea-30)]">
                    <span className="text-xs font-semibold text-[var(--linea)] block">
                      Selecciona un Color Gastronómico:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setBgColor(preset.hex)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer",
                            bgColor === preset.hex
                              ? "border-[var(--brasa)] ring-2 ring-[var(--brasa)]/40 bg-[var(--panel-2)] font-bold"
                              : "border-[var(--linea-30)] bg-[var(--panel-2)]/40 hover:bg-[var(--panel-2)]",
                          )}
                        >
                          <span
                            className="size-5 rounded-full border border-[var(--linea-30)] shrink-0 shadow-inner"
                            style={{ backgroundColor: preset.hex }}
                          />
                          <div className="min-w-0">
                            <span className="text-xs text-[var(--papel)] block truncate">{preset.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── Color de acento ───────────────────────────────────────
                    El fondo ya se elegía; esto es lo que faltaba. Los botones,
                    los precios y los totales del menú se pintan con este color.
                    ─────────────────────────────────────────────────────────── */}
                <div className="space-y-3 pt-3 border-t border-dashed border-[var(--linea-30)]">
                  <div>
                    <span className="text-xs font-semibold text-[var(--papel)] block">
                      Color de acento
                    </span>
                    <span className="text-rotulo text-muted-foreground block">
                      Con este color se pintan los botones, los precios y el total del menú.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {ACENTOS.map((op) => (
                      <button
                        key={op.hex}
                        type="button"
                        onClick={() => setAccent(op.hex)}
                        title={op.name}
                        aria-label={`Acento ${op.name}`}
                        aria-pressed={accent === op.hex}
                        className={cn(
                          "size-11 rounded-full border-2 transition-all cursor-pointer",
                          accent === op.hex
                            ? "border-[var(--papel)] ring-2 ring-[var(--papel)]/40 scale-110"
                            : "border-[var(--linea-30)] hover:border-[var(--papel-60)]",
                        )}
                        style={{ backgroundColor: op.hex }}
                      />
                    ))}
                    <label className="flex items-center gap-2 text-rotulo text-muted-foreground">
                      <span>Otro</span>
                      <input
                        type="color"
                        value={accent}
                        onChange={(e) => setAccent(e.target.value.toUpperCase())}
                        aria-label="Elegir otro color de acento"
                        className="size-11 cursor-pointer rounded-lg border border-[var(--linea-30)] bg-transparent p-1"
                      />
                    </label>
                  </div>
                  {/* El color lo elige una persona que no está mirando la norma de
                      contraste: si el acento no se lee sobre el fondo, se avisa acá
                      y no en la calle, con el cliente adelante. */}
                  {!acentoSirveComoTexto(accent, bgMode === "SOLID" ? bgColor : "#171512") && (
                    <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-rotulo text-warning-soft">
                      Ese acento queda muy cerca del fondo. Los botones se van a ver bien,
                      pero los precios escritos con él se leen apenas: el menú los va a
                      aclarar solo para que no desaparezcan.
                    </p>
                  )}
                </div>

                {/* Vista: Degradados en Cuadrícula */}
                {bgMode === "GRADIENT" && (
                  <div className="space-y-3 pt-3 border-t border-dashed border-[var(--linea-30)]">
                    <span className="text-xs font-semibold text-[var(--linea)] block">
                      Selecciona una Atmósfera de Degradado:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {GRADIENT_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setBgGradient(preset.value)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all cursor-pointer",
                            bgGradient === preset.value
                              ? "border-[var(--brasa)] ring-2 ring-[var(--brasa)]/40 bg-[var(--panel-2)] font-bold"
                              : "border-[var(--linea-30)] bg-[var(--panel-2)]/40 hover:bg-[var(--panel-2)]",
                          )}
                        >
                          <span
                            className="size-7 rounded-lg border border-[var(--linea-30)] shrink-0 shadow-md"
                            style={{ background: preset.value }}
                          />
                          <span className="text-xs text-[var(--papel)] font-medium truncate">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vista: Texturas y Carga de Foto */}
                {bgMode === "PATTERN_IMAGE" && (
                  <div className="space-y-4 pt-3 border-t border-dashed border-[var(--linea-30)]">
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-[var(--linea)] block">
                        Patrones de Textura Listos:
                      </span>
                      <div className="grid grid-cols-2 gap-2.5">
                        {TEXTURE_PRESETS.map((patron) => (
                          <button
                            key={patron.name}
                            type="button"
                            onClick={() => setBgImageUrl(patron.url)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer",
                              bgImageUrl === patron.url
                                ? "border-[var(--brasa)] ring-2 ring-[var(--brasa)]/40 bg-[var(--panel-2)] font-bold"
                                : "border-[var(--linea-30)] bg-[var(--panel-2)]/40 hover:bg-[var(--panel-2)]",
                            )}
                          >
                            <span className="text-base">{patron.icon}</span>
                            <span className="text-xs text-[var(--papel)] truncate">{patron.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-3 bg-[var(--panel-2)] border border-[var(--linea-30)] p-3 rounded-xl">
                      <span className="text-xs text-[var(--linea)]">
                        O sube tu propia imagen de textura:
                      </span>
                      <div className="flex gap-2">
                        <label className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brasa)] text-[var(--tinta)] px-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-[var(--brasa-hover)] shadow-md transition-all">
                          {subiendoFondo ? "Subiendo..." : "📤 Cargar Foto"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => void manejarSubidaArchivo(e, "fondo")}
                            disabled={subiendoFondo}
                            className="hidden"
                          />
                        </label>
                        {bgImageUrl && (
                          <button
                            type="button"
                            onClick={() => setBgImageUrl("")}
                            className="p-1.5 rounded-lg border border-[var(--linea-30)] text-destructive-soft hover:bg-destructive/40 text-xs"
                            title="Quitar imagen"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Subida de Logo en 1 Clic */}
              <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-6 space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold uppercase tracking-wider text-[var(--linea)]">
                    Logo del Restaurante
                  </Label>
                  <p className="text-xs text-[var(--linea)]">
                    Aparecerá en la parte superior del menú digital y en las tarjetas QR impresas.
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-[var(--panel-2)] border border-[var(--linea-30)] p-4 rounded-xl">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="size-16 rounded-full object-cover border-2 border-[var(--brasa)] shadow-md"
                    />
                  ) : (
                    <div className="size-16 rounded-full bg-[var(--tinta)] border-2 border-dashed border-[var(--linea-30)] flex items-center justify-center text-[var(--papel)] font-display font-black text-2xl">
                      {(headerTitle || "P").slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brasa)] text-[var(--tinta)] px-3.5 py-2 text-xs font-bold cursor-pointer hover:bg-[var(--brasa-hover)] shadow-md transition-all">
                        {subiendoLogo ? "Subiendo Logo..." : "📤 Subir Nuevo Logo"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => void manejarSubidaArchivo(e, "logo")}
                          disabled={subiendoLogo}
                          className="hidden"
                        />
                      </label>
                      {logoUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setLogoUrl("")}
                          className="text-xs text-destructive-soft border-destructive/40 hover:bg-destructive/30"
                        >
                          Quitar Logo
                        </Button>
                      )}
                    </div>
                    <p className="text-rotulo text-[var(--linea)]">
                      Formatos recomendados: PNG o JPG cuadrado (mínimo 200x200 px).
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              PESTAÑA 2: DOMICILIOS & TEXTOS
              ══════════════════════════════════════════════════════════════════ */}
          {tabActiva === "textos" && (
            <div className="space-y-6">
              
              {/* Título y Mensaje de Bienvenida */}
              <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-6 space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold uppercase tracking-wider text-[var(--linea)]">
                    Título Principal de la Carta
                  </Label>
                  <Input
                    value={headerTitle}
                    onChange={(e) => setHeaderTitle(e.target.value)}
                    placeholder="Ej. Menú Digital & Domicilios"
                    className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)] text-sm font-bold"
                  />
                </div>

                {/* Presets de Títulos */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-rotulo text-[var(--linea)] block font-semibold">
                    Frases rápidas sugeridas:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {TITLE_PRESETS.map((txt) => (
                      <button
                        key={txt}
                        type="button"
                        onClick={() => setHeaderTitle(txt)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs border transition-all cursor-pointer",
                          headerTitle === txt
                            ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] font-bold"
                            : "bg-[var(--panel-2)] text-[var(--linea)] border-[var(--linea-30)] hover:text-[var(--papel)]",
                        )}
                      >
                        {txt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 pt-3 border-t border-dashed border-[var(--linea-30)]">
                  <Label className="text-xs font-bold uppercase tracking-wider text-[var(--linea)]">
                    Subtítulo / Mensaje de Bienvenida
                  </Label>
                  <Input
                    value={headerSubtitle}
                    onChange={(e) => setHeaderSubtitle(e.target.value)}
                    placeholder="Ej. Pide directo y recibe tus platos calientes"
                    className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)] text-sm"
                  />
                </div>

                {/* Presets de Subtítulos */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-rotulo text-[var(--linea)] block font-semibold">
                    Mensajes de llamado a la acción:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SUBTITLE_PRESETS.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setHeaderSubtitle(sub)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs border transition-all cursor-pointer",
                          headerSubtitle === sub
                            ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] font-bold"
                            : "bg-[var(--panel-2)] text-[var(--linea)] border-[var(--linea-30)] hover:text-[var(--papel)]",
                        )}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Configuración de Domicilios Operativa */}
              <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛵</span>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--papel)]">Módulo de Pedidos a Domicilio</h3>
                    <p className="text-xs text-[var(--linea)]">Los pedidos web se reciben directamente en la pantalla de Domicilios y Cocina.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 pt-2">
                  <div className="bg-[var(--panel-2)] border border-[var(--linea-30)] p-3.5 rounded-xl text-center space-y-1">
                    <span className="text-xs text-[var(--linea)] block">Tiempo promedio:</span>
                    <span className="font-mono font-bold text-sm text-[var(--brasa)]">25 - 40 MIN</span>
                  </div>
                  <div className="bg-[var(--panel-2)] border border-[var(--linea-30)] p-3.5 rounded-xl text-center space-y-1">
                    <span className="text-xs text-[var(--linea)] block">Canal de entrega:</span>
                    <span className="font-mono font-bold text-sm text-[var(--papel)]">PROPIO / WHATSAPP</span>
                  </div>
                  <div className="bg-[var(--panel-2)] border border-[var(--linea-30)] p-3.5 rounded-xl text-center space-y-1">
                    <span className="text-xs text-[var(--linea)] block">Notificación:</span>
                    <span className="font-mono font-bold text-sm text-success-soft">EN TIEMPO REAL</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              PESTAÑA 3: CÓDIGOS QR & ENLACES
              ══════════════════════════════════════════════════════════════════ */}
          {tabActiva === "qrs" && (
            <div className="space-y-6">
              
              {/* Tarjeta de Domicilio Global */}
              <div className="rounded-2xl border-2 border-[var(--brasa)] bg-[var(--panel-bg)] p-6 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-[var(--brasa)] animate-pulse" />
                      <span className="font-mono text-xs font-bold text-[var(--brasa)] uppercase">
                        ENLACE GLOBAL DE DOMICILIOS & CARTA
                      </span>
                    </div>
                    <h3 className="text-lg font-black font-display uppercase text-[var(--papel)]">
                      Tu Menú Web para Redes y WhatsApp
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => copiarEnlace(urlDomicilio, "domicilio-btn")}
                      className="bg-[var(--brasa)] text-[var(--tinta)] font-bold text-xs h-9 hover:bg-[var(--brasa-hover)] cursor-pointer"
                    >
                      {copiado === "domicilio-btn" ? "✔ Copiado" : "📋 Copiar Enlace"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        ejecutarImpresion({
                          identificador: "DOMICILIOS & LLEVAR",
                          subtitulo: "Pide directo desde tu celular para entrega a domicilio",
                          url: urlDomicilio,
                        })
                      }
                      className="border-[var(--linea-30)] text-[var(--papel)] text-xs h-9 hover:bg-[var(--panel-2)] cursor-pointer"
                    >
                      🖨️ Imprimir QR
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-[var(--panel-2)] border border-[var(--linea-30)] p-3.5 rounded-xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(urlDomicilio)}`}
                    alt="QR Domicilio"
                    className="size-20 rounded-lg border border-[var(--linea-30)] p-1 bg-white shrink-0 shadow-md"
                  />
                  <div className="min-w-0 space-y-1 flex-1">
                    <span className="font-mono text-xs text-[var(--papel)] font-bold block truncate">
                      {urlDomicilio}
                    </span>
                    <a
                      href={urlDomicilio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--brasa)] font-bold hover:underline inline-flex items-center gap-1"
                    >
                      Abrir menú en nueva pestaña ↗
                    </a>
                  </div>
                </div>
              </div>

              {/* Códigos QR por Mesa */}
              {settings.mesas.length > 0 && (
                <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--papel)]">
                      Códigos QR por Mesa en Salón ({settings.mesas.length})
                    </h4>
                    <span className="text-xs font-mono text-[var(--linea)]">Auto-asignación de mesa</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {settings.mesas.map((mesa) => {
                      const urlMesa = `${appUrl}/m/${settings.slug}?mesa=${encodeURIComponent(mesa.name)}&tableId=${mesa.id}`;
                      return (
                        <div
                          key={mesa.id}
                          className="rounded-xl border border-[var(--linea-30)] bg-[var(--panel-2)] p-3.5 space-y-2.5 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display font-black text-base text-[var(--papel)]">
                              🪑 MESA {mesa.name}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  ejecutarImpresion({
                                    identificador: `MESA ${mesa.name}`,
                                    subtitulo: `Pedido asignado automáticamente a la Mesa ${mesa.name}`,
                                    url: urlMesa,
                                  })
                                }
                                className="h-7 text-xs font-semibold px-2 text-[var(--papel)] hover:bg-[var(--panel-3)]"
                              >
                                🖨️ Imprimir
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copiarEnlace(urlMesa, mesa.id)}
                                className="h-7 text-xs font-semibold px-2 text-[var(--linea)] hover:text-[var(--papel)] hover:bg-[var(--panel-3)]"
                              >
                                {copiado === mesa.id ? "✔" : "Copiar"}
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(urlMesa)}`}
                              alt={`QR Mesa ${mesa.name}`}
                              className="size-16 rounded-lg border border-[var(--linea-30)] p-1 bg-white shrink-0 shadow-sm"
                            />
                            <div className="text-xs space-y-1 min-w-0 flex-1">
                              <span className="text-rotulo text-[var(--linea)] block truncate font-mono">
                                /m/{settings.slug}?mesa={mesa.name}
                              </span>
                              <a
                                href={urlMesa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--brasa)] font-bold hover:underline block text-xs"
                              >
                                Probar QR →
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Botón Guardar Cambios */}
          <div className="pt-2">
            <Button
              type="submit"
              className="w-full bg-[var(--brasa)] text-[var(--tinta)] hover:bg-[var(--brasa-hover)] font-bold text-base h-12 shadow-xl shadow-[var(--brasa)]/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              💾 Guardar Personalización del Menú & Domicilios
            </Button>
          </div>
        </form>

        {/* ══════════════════════════════════════════════════════════════════
            COLUMNA DERECHA: SIMULADOR DE SMARTPHONE EN VIVO
            ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3 lg:col-span-5 sticky top-6">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--linea)] flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--brasa)] animate-pulse" />
              SIMULADOR MÓVIL EN VIVO
            </span>

            {/* Alternador de vista previa */}
            <div className="flex bg-[var(--panel-2)] border border-[var(--linea-30)] rounded-lg p-0.5 text-rotulo">
              <button
                type="button"
                onClick={() => setPreviewModo("domicilio")}
                className={cn(
                  "px-2 py-1 rounded-md font-bold transition-all",
                  previewModo === "domicilio" ? "bg-[var(--brasa)] text-[var(--tinta)]" : "text-[var(--linea)]",
                )}
              >
                🛵 Domicilio
              </button>
              <button
                type="button"
                onClick={() => setPreviewModo("mesa")}
                className={cn(
                  "px-2 py-1 rounded-md font-bold transition-all",
                  previewModo === "mesa" ? "bg-[var(--brasa)] text-[var(--tinta)]" : "text-[var(--linea)]",
                )}
              >
                🍽️ Mesa 04
              </button>
            </div>
          </div>

          {/* Marco del Teléfono */}
          <div className="rounded-[2.5rem] border-4 border-[#2D2A26] bg-[#12100E] p-3 shadow-2xl overflow-hidden max-w-xs mx-auto">
            <div
              className="rounded-[2rem] overflow-hidden text-[var(--papel)] min-h-[520px] flex flex-col relative text-xs shadow-inner transition-all duration-300"
              style={previewBackgroundStyle}
            >
              {/* Notch y Bocina */}
              <div className="w-24 h-4 bg-[#171512] mx-auto rounded-b-xl mb-2 flex items-center justify-center shadow-md">
                <div className="size-1.5 rounded-full bg-[#3A3733]" />
              </div>

              {/* Cabecera del Menú */}
              <div className="p-4 text-center space-y-2 bg-black/50 backdrop-blur-md border-b border-white/10">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="size-14 mx-auto rounded-full object-cover border-2 border-[var(--brasa)] shadow-lg animate-card-in"
                  />
                ) : (
                  <div className="size-12 mx-auto rounded-full bg-[var(--brasa)]/20 border border-[var(--brasa)] flex items-center justify-center font-display font-black text-[var(--papel)] text-xl shadow-md">
                    {(headerTitle || "P").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div>
                  <h4 className="font-black font-display text-base leading-tight uppercase tracking-tight text-[var(--papel)]">
                    {headerTitle || "Menú Digital"}
                  </h4>
                  <p className="text-rotulo text-[var(--linea)] leading-tight mt-0.5">
                    {headerSubtitle || "Pide directo desde tu celular"}
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--panel-2)]/90 border border-[var(--linea-30)] text-rotulo font-mono font-bold text-[var(--brasa)]">
                  {previewModo === "mesa" ? "🪑 Mesa 04 · Salón" : "🛵 Domicilio · 25-40 min"}
                </div>
              </div>

              {/* Contenido Simulado de la Carta */}
              <div className="p-3 flex-1 space-y-2.5 bg-black/20 overflow-y-auto">
                {/* Buscador ficticio */}
                <div className="h-7 bg-white/10 rounded-full px-3 flex items-center text-rotulo text-[var(--linea)] border border-white/10">
                  🔍 Buscar hamburguesa, cerveza...
                </div>

                {/* Categorías simuladas */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 text-rotulo font-mono">
                  <span className="px-2 py-0.5 rounded-full bg-[var(--brasa)] text-[var(--tinta)] font-bold shrink-0">
                    Todas (12)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[var(--papel)] shrink-0">
                    🍔 Burgers
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[var(--papel)] shrink-0">
                    🍺 Bebidas
                  </span>
                </div>

                {/* Tarjetas de platos simulados */}
                <div className="space-y-2 pt-1">
                  {[
                    {
                      nombre: "Burger Especial Ahumada",
                      precio: "$28.000 COP",
                      desc: "Carne artesanal 180g, queso cheddar, tocineta crocante",
                    },
                    {
                      nombre: "Papas Rústicas con Queso",
                      precio: "$14.000 COP",
                      desc: "Con tocineta picada y salsa de la casa",
                    },
                    {
                      nombre: "Cerveza Artesanal IPA",
                      precio: "$12.000 COP",
                      desc: "Botella 330ml bien fría",
                    },
                  ].map((plato, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/10 bg-black/40 p-2.5 space-y-1 backdrop-blur-sm"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs text-[var(--papel)]">{plato.nombre}</span>
                        <span className="font-mono font-bold text-xs text-[var(--brasa)]">{plato.precio}</span>
                      </div>
                      <p className="text-rotulo text-[var(--linea)] leading-tight">{plato.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Barra Flotante de Pedido en Celular */}
              <div className="p-2.5 bg-[#171512]/95 border-t border-white/10">
                <div className="w-full bg-[var(--brasa)] text-[var(--tinta)] py-2 px-3 rounded-xl font-bold font-mono text-xs flex items-center justify-between shadow-lg">
                  <span>🛒 Ver Pedido (2)</span>
                  <span>$42.000 COP</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ─── Modal de Impresión de Tarjeta QR ─── */}
      {tarjetaImprimir && (
        <Dialog open={!!tarjetaImprimir} onOpenChange={(open) => !open && setTarjetaImprimir(null)}>
          <DialogContent className="max-w-md p-6 text-center space-y-4 max-h-[90vh] overflow-y-auto bg-[var(--panel-bg)] text-[var(--papel)] border border-[var(--linea-30)]">
            <DialogHeader className="no-print">
              <DialogTitle className="text-center font-display font-black text-xl uppercase tracking-tight">
                Tarjeta QR Imprimible
              </DialogTitle>
            </DialogHeader>

            <div id="tarjeta-qr-print-wrapper" className="flex items-center justify-center p-2 w-full my-auto">
              <div
                id="tarjeta-qr-print"
                className="w-[290px] min-w-[290px] max-w-[290px] rounded-2xl border-2 border-[var(--tinta)] bg-[#EDE7DA] p-5 text-[#171512] flex flex-col items-center text-center space-y-3.5 shadow-xl shrink-0 mx-auto"
              >
                {/* Logo / Header */}
                <div className="flex flex-col items-center space-y-1 w-full">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="size-14 rounded-full object-cover border-2 border-[#FF4E1F] shadow-sm block mx-auto"
                    />
                  ) : (
                    <div className="size-12 rounded-xl bg-[#171512] text-[#EDE7DA] font-black flex items-center justify-center text-lg shadow-sm mx-auto border-2 border-[#FF4E1F]">
                      {(headerTitle || "P").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <h3 className="font-black text-base uppercase tracking-tight text-[#171512] leading-tight w-full truncate text-center">
                    {headerTitle || "Menú Digital"}
                  </h3>
                  <p className="text-rotulo text-[#555047] font-medium leading-tight max-w-[240px] mx-auto text-center">
                    {headerSubtitle || "Pide directo desde tu celular"}
                  </p>
                </div>

                {/* Identificador Destacado */}
                <div className="w-full flex justify-center">
                  <div className="bg-[#171512] text-[#FF4E1F] py-1.5 px-4 rounded-xl font-mono font-black text-xs uppercase tracking-widest text-center shadow-md max-w-full truncate">
                    {tarjetaImprimir.identificador}
                  </div>
                </div>

                {/* Código QR */}
                <div className="p-2.5 bg-white border-2 border-[#171512] rounded-2xl flex items-center justify-center shadow-inner mx-auto">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(tarjetaImprimir.url)}`}
                    alt={tarjetaImprimir.identificador}
                    className="size-40 object-contain block mx-auto shrink-0"
                  />
                </div>

                {/* Instrucciones */}
                <div className="space-y-0.5 text-xs text-[#171512] w-full text-center">
                  <p className="font-extrabold text-[#171512] text-center text-xs">📱 Escaneá con tu celular</p>
                  <p className="text-rotulo text-[#555047] max-w-[230px] mx-auto leading-tight text-center">
                    {tarjetaImprimir.subtitulo}
                  </p>
                </div>

                {/* URL Footer */}
                <div className="w-full text-rotulo font-mono text-[#777063] border-t border-[#C9C2AF] pt-2 text-center truncate">
                  {tarjetaImprimir.url}
                </div>
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="flex gap-2 justify-end pt-2 no-print">
              <Button variant="outline" onClick={() => setTarjetaImprimir(null)} className="text-xs border-[var(--linea-30)]">
                Cerrar
              </Button>
              <Button
                onClick={() => ejecutarImpresion(tarjetaImprimir)}
                className="bg-[var(--brasa)] text-[var(--tinta)] font-bold text-xs gap-1.5 shadow-md hover:bg-[var(--brasa-hover)]"
              >
                🖨️ Imprimir Ahora
              </Button>
            </div>

            <style jsx global>{`
              @media print {
                @page {
                  size: portrait;
                  margin: 0;
                }
                body {
                  background: white !important;
                  color: black !important;
                }
                .no-print {
                  display: none !important;
                }
                #tarjeta-qr-print-wrapper {
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  width: 100vw !important;
                  height: 100vh !important;
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  background: white !important;
                  z-index: 999999 !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                #tarjeta-qr-print {
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  width: 270px !important;
                  min-width: 270px !important;
                  max-width: 270px !important;
                  padding: 16px !important;
                  border: 2px solid #000000 !important;
                  border-radius: 16px !important;
                  box-shadow: none !important;
                  background: #EDE7DA !important;
                  color: #000000 !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
              }
            `}</style>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export type FactusSettings = {
  facturacionElectronicaHabilitada: boolean;
  paquetesDocumentosDisponibles: number;
  documentosEmitidosConsumidos: number;
  factusNumberingRangeId: number | null;
  municipalityCode: string | null;
  /** Lo que falta para poder facturar, calculado en el servidor. */
  faltantes: string[];
};

/**
 * El estado fiscal del negocio, de solo lectura.
 *
 * Acá se editaban las credenciales de Factus y el rango de numeración. Ya no: la
 * cuenta de Factus es de la plataforma —Factus nos vende una bolsa de documentos
 * y Platlia la reparte—, así que las credenciales viven en el entorno y el rango
 * que la DIAN le autorizó a este NIT lo asigna el superadministrador. Un dígito
 * equivocado en ese id es una factura rechazada que aparece recién al emitir, con
 * el cliente esperando en la caja.
 *
 * Lo que sí necesita ver el dueño está todo acá: si está prendido, cuántos
 * documentos le quedan, con qué rango se está facturando y a quién escribirle.
 */
export function FormularioFactus({ settings }: { settings: FactusSettings }) {
  const habilitado = settings.facturacionElectronicaHabilitada;
  const disponibles = settings.paquetesDocumentosDisponibles ?? 0;
  const consumidos = settings.documentosEmitidosConsumidos ?? 0;
  const remanentes = Math.max(0, disponibles - consumidos);
  const listo = settings.faltantes.length === 0;

  if (!habilitado) {
    return (
      <div className="space-y-4">
        <div className="space-y-2 rounded-2xl border border-warning/30 bg-warning/10 p-5 text-warning-soft">
          <p className="text-base font-bold">Facturación electrónica DIAN no habilitada</p>
          <p className="text-xs leading-relaxed opacity-90">
            Emitir facturas electrónicas ante la DIAN es un módulo opcional: se cobra por paquete de
            documentos. Escribinos y lo activamos para este negocio.
          </p>
        </div>
        <EnlaceSoporte />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Documentos del paquete */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Recuadro rotulo="Paquete asignado" valor={disponibles} unidad="docs" />
        <Recuadro rotulo="Emitidos" valor={consumidos} unidad="docs" />
        <Recuadro
          rotulo="Disponibles"
          valor={remanentes}
          unidad="docs"
          alerta={remanentes === 0}
        />
      </div>

      {remanentes === 0 && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            No quedan documentos en el paquete: las ventas se siguen cobrando, pero no se puede
            emitir factura electrónica hasta recargarlo.
          </AlertDescription>
        </Alert>
      )}

      {/* Con qué se está facturando */}
      <div className="space-y-3 rounded-2xl border border-[var(--linea-16)] bg-[var(--panel)] p-5">
        <h3 className="font-display text-lg font-black uppercase tracking-tight">
          Resolución y datos DIAN
        </h3>
        <dl className="space-y-2 text-xs">
          <Dato
            termino="Rango de numeración"
            valor={
              settings.factusNumberingRangeId
                ? `#${settings.factusNumberingRangeId}`
                : "Sin asignar"
            }
          />
          <Dato termino="Código DANE del municipio" valor={settings.municipalityCode ?? "—"} />
        </dl>
        <p className="text-rotulo text-muted-foreground">
          Los asigna el equipo de Platlia con la resolución que la DIAN le autorizó a tu NIT.
        </p>
      </div>

      {/* Estado */}
      {listo ? (
        <Alert className="border-success/40 bg-success/10 text-success-soft">
          <AlertDescription>
            Todo listo: al cobrar podés marcar &quot;factura electrónica&quot; y emitirla desde
            Caja, en la sección de cuentas cobradas.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <span className="font-bold">Falta algo para poder facturar:</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {settings.faltantes.map((falta) => (
                <li key={falta}>{falta}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <EnlaceSoporte />
    </div>
  );
}

function Recuadro({
  rotulo,
  valor,
  unidad,
  alerta,
}: {
  rotulo: string;
  valor: number;
  unidad: string;
  alerta?: boolean;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-[var(--linea-16)] bg-[var(--panel-2)] p-4">
      <span className="text-rotulo font-semibold uppercase text-muted-foreground">{rotulo}</span>
      <p
        className={`numeral text-2xl font-bold ${alerta ? "text-destructive-soft" : "text-foreground"}`}
      >
        {valor} <span className="text-xs font-normal text-muted-foreground">{unidad}</span>
      </p>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--linea-16)] pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{termino}</dt>
      <dd className="font-mono font-bold text-foreground">{valor}</dd>
    </div>
  );
}

function EnlaceSoporte() {
  return (
    <a
      href={enlaceWhatsapp("Quiero hablar sobre la facturación electrónica DIAN.")}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-4 text-xs font-bold text-brand transition-colors hover:bg-brand/20"
    >
      Escribirle a soporte
    </a>
  );
}
