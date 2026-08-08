"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ReceiptWidth } from "@/generated/prisma/enums";
import { guardarConfiguracionFactus, guardarDatosNegocio, guardarModulos, guardarOperacion, guardarQrMenuSettings, guardarTurneroSettings, subirImagenQrMenu } from "@/features/negocio/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { pagarSuscripcion, solicitarSedeAdicional } from "@/features/facturacion/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { diasParaElCorte } from "@/lib/billing/suscripcion";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
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
            className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
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
          className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
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
  inventoryEnabled,
  recipesEnabled,
}: {
  mesasHabilitado: boolean;
  deliveryEnabled: boolean;
  inventoryEnabled: boolean;
  recipesEnabled: boolean;
}) {
  const [estado, accion] = useActionState(guardarModulos, ESTADO_INICIAL);

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

      <Casilla
        name="deliveryEnabled"
        label="Este negocio reparte a domicilio"
        defaultChecked={deliveryEnabled}
        ayuda="Si lo apagás, 'Domicilio' deja de ofrecerse como tipo de pedido."
      />

      <Casilla
        name="inventoryEnabled"
        label="Gestión de Inventario (Insumos, Entradas por Factura y Stock)"
        defaultChecked={inventoryEnabled}
        ayuda="Al activarlo, aparece el módulo de Inventario en el menú superior para propietarios, administradores y cajeros."
      />

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
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
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
              className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
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
              className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
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
    priceCop: number;
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
  } | null;
  timeZone: string;
};

export function FormularioLicencia({ suscripcion, timeZone }: FormularioLicenciaProps) {
  const [openModal, setOpenModal] = useState(false);
  const [estadoPago, accionPago] = useActionState(pagarSuscripcion, ESTADO_INICIAL);
  const [estadoSolicitud, accionSolicitud] = useActionState(solicitarSedeAdicional, ESTADO_INICIAL);

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
      <Resultado estado={estadoPago} />
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
                ? `${formatCop(suscripcion.priceCop)} / mes`
                : "Sin suscripción"}
            </span>
          </div>

          {infoEstado && (
            <Badge variant={infoEstado.variante} className="text-xs font-bold px-3 py-1">
              {infoEstado.texto}
            </Badge>
          )}
        </div>

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
                <dd className={`numeral font-bold ${dias <= 3 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {dias > 0 ? `${dias} días` : "Servicio suspendido (renová para trabajar)"}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <form action={accionPago} className="flex-1 sm:flex-none">
            <Button type="submit" size="sm" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 text-xs font-semibold">
              💳 Pagar / Renovar Licencia con MercadoPago
            </Button>
          </form>

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
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
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
                      <option value="2">2 Sucursales ($80.000 COP / mes)</option>
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
                      <option value="1">Mensual ($50k / 1 sede - $80k / 2 sedes)</option>
                      <option value="6">Semestral 6 Meses - 10% desc. ($270k / 1 sede - $432k / 2 sedes)</option>
                      <option value="12">Anual 12 Meses - 20% desc. ($480k / 1 sede - $768k / 2 sedes)</option>
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
            <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 block">$50.000 COP / mes</span>
            <span className="text-[11px] text-muted-foreground">Todos los módulos incluidos (Salón, POS, Cocina, Caja, Inventario, Recetas e Informes).</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-card">
            <span className="font-bold text-foreground block">2 Sucursales</span>
            <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 block">$80.000 COP / mes</span>
            <span className="text-[11px] text-muted-foreground">Ahorro de $20.000 COP/mes en la segunda sede.</span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-brand/30 bg-brand/5 text-xs space-y-1">
          <span className="font-bold text-brand dark:text-[#3E9EA2] block">✨ Descuentos por Pago Anticipado</span>
          <p className="text-muted-foreground">
            • <strong>6 Meses (Semestral):</strong> 10% de descuento ($270.000 para 1 sede / $432.000 para 2 sedes).<br />
            • <strong>12 Meses (Anual):</strong> 20% de descuento ($480.000 para 1 sede / $768.000 para 2 sedes).<br />
            • <strong>3 o más Sucursales:</strong> Contactate con nuestro equipo para definir precio corporativo especial.
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
  slug: string;
  mesas: { id: string; name: string }[];
  deliveryEnabled?: boolean;
};

const COLOR_PRESETS = [
  { name: "Obsidiana", hex: "#101416" },
  { name: "Verde Esmeralda", hex: "#1D4E51" },
  { name: "Terracota Cálido", hex: "#A75F39" },
  { name: "Azul Medianoche", hex: "#0D1B2A" },
  { name: "Ciruela Real", hex: "#1A0B2E" },
  { name: "Café Espresso", hex: "#1C100B" },
];

const GRADIENT_PRESETS = [
  { name: "Esmeralda Profundo", value: "linear-gradient(135deg, #101416 0%, #1D4E51 100%)" },
  { name: "Atardecer Terracota", value: "linear-gradient(135deg, #101416 0%, #A75F39 100%)" },
  { name: "Aurora Cosmológica", value: "linear-gradient(135deg, #090A0F 0%, #1A2639 50%, #114B5F 100%)" },
  { name: "Noche Ámbar Dorada", value: "linear-gradient(135deg, #0D0D0D 0%, #2A1F13 50%, #6B4E28 100%)" },
  { name: "Lujo Pavorreal", value: "linear-gradient(135deg, #0A192F 0%, #1E3A8A 50%, #0D9488 100%)" },
];

export function FormularioQrMenu({ settings }: { settings: QrMenuSettingsProps }) {
  const [estado, accion] = useActionState(guardarQrMenuSettings, ESTADO_INICIAL);
  const [habilitado, setHabilitado] = useState(settings.qrMenuEnabled);
  const [bgMode, setBgMode] = useState(settings.qrMenuBgMode || "SOLID");
  const [bgColor, setBgColor] = useState(settings.qrMenuBgColor || "#101416");
  const [bgGradient, setBgGradient] = useState(
    settings.qrMenuBgGradient || "linear-gradient(135deg, #101416 0%, #1D4E51 100%)",
  );
  const [bgImageUrl, setBgImageUrl] = useState(settings.qrMenuBgImageUrl || "");
  const [logoUrl, setLogoUrl] = useState(settings.qrMenuLogoUrl || "");
  const [headerTitle, setHeaderTitle] = useState(settings.qrMenuHeaderTitle || "");
  const [headerSubtitle, setHeaderSubtitle] = useState(settings.qrMenuHeaderSubtitle || "");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoFondo, setSubiendoFondo] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [tarjetaImprimir, setTarjetaImprimir] = useState<{
    identificador: string;
    subtitulo: string;
    url: string;
  } | null>(null);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://platlia.com";
  const urlDomicilio = `${appUrl}/m/${settings.slug}?tipo=domicilio`;

  const copiarEnlace = (url: string, id: string) => {
    if (typeof navigator !== "undefined") {
      void navigator.clipboard.writeText(url);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2500);
    }
  };

  const ejecutarImpresion = (datos: { identificador: string; subtitulo: string; url: string }) => {
    if (typeof window === "undefined") return;

    const win = window.open("", "_blank", "width=480,height=680");
    if (!win) return;

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(datos.url)}`;
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" class="logo" alt="Logo" />`
      : `<div class="logo-text">${(headerTitle || "S").slice(0, 2).toUpperCase()}</div>`;

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Imprimir QR - ${datos.identificador}</title>
        <style>
          @page { size: portrait; margin: 10mm; }
          body {
            margin: 0;
            padding: 24px;
            background: #ffffff;
            color: #000000;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 90vh;
          }
          .card {
            width: 290px;
            border: 3px solid #0f172a;
            border-radius: 20px;
            padding: 24px;
            background: #ffffff;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.08);
            margin: 0 auto;
          }
          .logo {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid #cbd5e1;
            margin-bottom: 8px;
          }
          .logo-text {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #0f172a;
            color: #ffffff;
            font-weight: 900;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
          }
          .title {
            font-size: 20px;
            font-weight: 900;
            margin: 0;
            color: #0f172a;
            line-height: 1.2;
          }
          .subtitle {
            font-size: 11px;
            color: #475569;
            margin: 4px 0 14px 0;
          }
          .badge {
            background: #0f172a;
            color: #ffffff;
            font-weight: 900;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 2px;
            padding: 6px 16px;
            border-radius: 12px;
            margin-bottom: 14px;
          }
          .qr-frame {
            padding: 10px;
            border: 2px solid #e2e8f0;
            border-radius: 16px;
            background: #ffffff;
            margin-bottom: 12px;
          }
          .qr-img {
            width: 180px;
            height: 180px;
            display: block;
          }
          .instructions {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 2px 0;
          }
          .sub-instructions {
            font-size: 11px;
            color: #64748b;
            margin: 0;
          }
          .footer-url {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            font-family: monospace;
            font-size: 9.5px;
            color: #64748b;
            word-break: break-all;
            width: 100%;
          }
          .actions {
            margin-top: 20px;
            display: flex;
            gap: 10px;
          }
          .btn-imprimir {
            background: #1D4E51;
            color: white;
            border: none;
            padding: 10px 24px;
            font-size: 13px;
            font-weight: bold;
            border-radius: 10px;
            cursor: pointer;
          }
          @media print {
            .actions { display: none !important; }
            body { padding: 0; min-height: auto; }
            .card { box-shadow: none !important; border: 3px solid #000 !important; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          ${logoHtml}
          <h1 class="title">${headerTitle || "Menú Digital"}</h1>
          <p class="subtitle">${headerSubtitle || "Pedí directo desde tu celular"}</p>
          <div class="badge">${datos.identificador}</div>
          <div class="qr-frame">
            <img id="qr-image" src="${qrImageUrl}" class="qr-img" alt="QR Code" />
          </div>
          <p class="instructions">📱 Escaneá con tu celular</p>
          <p class="sub-instructions">${datos.subtitulo}</p>
          <div class="footer-url">${datos.url}</div>
        </div>
        <div class="actions">
          <button class="btn-imprimir" onclick="window.print()">🖨️ Mandar a Imprimir</button>
        </div>
        <script>
          const img = document.getElementById('qr-image');
          function doPrint() {
            setTimeout(() => {
              window.focus();
              window.print();
            }, 350);
          }
          if (img) {
            if (img.complete) {
              doPrint();
            } else {
              img.onload = doPrint;
              img.onerror = doPrint;
            }
          } else {
            doPrint();
          }
        </script>
      </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>, tipo: "logo" | "fondo") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (tipo === "logo") setSubiendoLogo(true);
    else setSubiendoFondo(true);

    try {
      const res = await subirImagenQrMenu(undefined, { tipo, file });
      if (res.ok && res.data) {
        if (tipo === "logo") {
          setLogoUrl(res.data.url);
        } else {
          setBgImageUrl(res.data.url);
          setBgMode("PATTERN_IMAGE");
        }
      }
    } catch {
      // Ignorar errores en UI
    } finally {
      if (tipo === "logo") setSubiendoLogo(false);
      else setSubiendoFondo(false);
    }
  };

  // Estilo preview en tiempo real
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
      <div className="grid gap-8 lg:grid-cols-12 items-start">
        
        {/* Formulario de Configuración (7 Columnas) */}
        <form action={accion} className="space-y-6 lg:col-span-7">
          <Resultado estado={estado} />

          {/* 1. Activar / Desactivar Menú QR */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4 shadow-sm">
            <div className="space-y-0.5">
              <Label className="text-base font-bold">Activar Menú Digital QR</Label>
              <p className="text-muted-foreground text-xs">
                Permite a los clientes ver la carta y hacer su pedido desde su celular leyendo un código QR.
              </p>
            </div>
            <input
              type="checkbox"
              name="qrMenuEnabled"
              checked={habilitado}
              onChange={(e) => setHabilitado(e.target.checked)}
              className="h-5 w-5 rounded border-border text-brand focus:ring-brand cursor-pointer"
            />
          </div>

          {/* 2. Personalización Visual del Fondo */}
          <div className="space-y-5 rounded-xl border border-border p-5 bg-card shadow-sm">
            <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              🎨 Estilo Visual y Fondo del Menú
            </h3>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Modo de Fondo</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "SOLID", label: "Color Sólido" },
                  { id: "GRADIENT", label: "Degradado" },
                  { id: "PATTERN_IMAGE", label: "Imagen Repetida (Patrón)" },
                ].map((modo) => (
                  <button
                    key={modo.id}
                    type="button"
                    onClick={() => setBgMode(modo.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-all text-center",
                      bgMode === modo.id
                        ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] font-bold shadow-sm"
                        : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--papel)] border-[var(--linea-30)]",
                    )}
                  >
                    {modo.label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="qrMenuBgMode" value={bgMode} />
            </div>

            {bgMode === "SOLID" && (
              <div className="space-y-3 pt-1 border-t border-border/60">
                <Label htmlFor="qrMenuBgColor" className="text-xs font-semibold">
                  Color de Fondo (Personalizado o Presets)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                  />
                  <Input
                    id="qrMenuBgColor"
                    name="qrMenuBgColor"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    placeholder="#101416"
                    className="font-mono text-xs"
                  />
                </div>

                {/* Presets de Color */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">Colores Predefinidos:</span>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setBgColor(preset.hex)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                          bgColor === preset.hex ? "border-brand ring-2 ring-brand/30 font-bold" : "border-border hover:bg-accent",
                        )}
                      >
                        <span className="size-3 rounded-full border border-black/20" style={{ backgroundColor: preset.hex }} />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {bgMode === "GRADIENT" && (
              <div className="space-y-3 pt-1 border-t border-border/60">
                <Label htmlFor="qrMenuBgGradient" className="text-xs font-semibold">
                  Estilo de Degradado CSS
                </Label>
                <Input
                  id="qrMenuBgGradient"
                  name="qrMenuBgGradient"
                  value={bgGradient}
                  onChange={(e) => setBgGradient(e.target.value)}
                  placeholder="linear-gradient(135deg, #101416 0%, #1D4E51 100%)"
                  className="font-mono text-xs"
                />

                {/* Presets de Degradado */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">Degradados Predefinidos:</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {GRADIENT_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setBgGradient(preset.value)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border p-2 text-left text-xs transition-all",
                          bgGradient === preset.value ? "border-brand ring-2 ring-brand/30 font-bold" : "border-border hover:bg-accent",
                        )}
                      >
                        <span className="size-6 rounded-md border border-white/20 shrink-0 shadow-sm" style={{ background: preset.value }} />
                        <span className="truncate text-[11px] font-semibold">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {bgMode === "PATTERN_IMAGE" && (
              <div className="space-y-3 pt-1 border-t border-border/60">
                <Label htmlFor="qrMenuBgImageUrl" className="text-xs font-semibold">
                  Imagen de Fondo Repetida (Patrón)
                </Label>
                
                <div className="flex gap-2">
                  <Input
                    id="qrMenuBgImageUrl"
                    name="qrMenuBgImageUrl"
                    value={bgImageUrl}
                    onChange={(e) => setBgImageUrl(e.target.value)}
                    placeholder="https://res.cloudinary.com/..."
                    className="text-xs flex-1"
                  />

                  {/* Subida Cloudinary Fondo */}
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 px-3 py-2 text-xs font-bold cursor-pointer shrink-0 shadow-sm transition-all">
                    {subiendoFondo ? "Subiendo..." : "🖼️ Subir a Cloudinary"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void manejarSubidaArchivo(e, "fondo")}
                      disabled={subiendoFondo}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  La imagen se repetirá automáticamente hacia abajo para llenar la pantalla completa del celular del cliente.
                </p>
              </div>
            )}

            {/* 3. Branding del Menú */}
            <div className="space-y-3 pt-3 border-t border-border/60">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Branding y Mensaje de Cabecera
              </h4>

              <div className="space-y-2">
                <Label htmlFor="qrMenuLogoUrl" className="text-xs font-semibold">
                  Logo del Restaurante
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="qrMenuLogoUrl"
                    name="qrMenuLogoUrl"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://res.cloudinary.com/..."
                    className="text-xs flex-1"
                  />
                  
                  {/* Subida Cloudinary Logo */}
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-white hover:bg-brand/90 px-3 py-2 text-xs font-bold cursor-pointer shrink-0 shadow-sm transition-all">
                    {subiendoLogo ? "Subiendo..." : "📤 Subir Logo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void manejarSubidaArchivo(e, "logo")}
                      disabled={subiendoLogo}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qrMenuHeaderTitle" className="text-xs font-semibold">
                    Título Principal
                  </Label>
                  <Input
                    id="qrMenuHeaderTitle"
                    name="qrMenuHeaderTitle"
                    value={headerTitle}
                    onChange={(e) => setHeaderTitle(e.target.value)}
                    placeholder="Menú Digital"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qrMenuHeaderSubtitle" className="text-xs font-semibold">
                    Subtítulo / Bienvenida
                  </Label>
                  <Input
                    id="qrMenuHeaderSubtitle"
                    name="qrMenuHeaderSubtitle"
                    value={headerSubtitle}
                    onChange={(e) => setHeaderSubtitle(e.target.value)}
                    placeholder="¡Pedí directamente desde tu celular!"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <Enviar>Guardar Configuración del Menú QR</Enviar>
        </form>

        {/* Simulador Interactivo de Dispositivo Celular (5 Columnas) */}
        <div className="space-y-3 lg:col-span-5 sticky top-6">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block text-center">
            📱 Vista Previa en Vivo (Celular del Cliente)
          </span>

          <div className="rounded-[2.5rem] border-4 border-slate-800 bg-slate-950 p-3 shadow-2xl overflow-hidden max-w-xs mx-auto">
            {/* Pantalla Celular */}
            <div className="rounded-[2rem] overflow-hidden text-white min-h-[520px] flex flex-col relative text-xs shadow-inner" style={previewBackgroundStyle}>
              {/* Notch cel */}
              <div className="w-24 h-4 bg-slate-900 mx-auto rounded-b-xl mb-3 flex items-center justify-center">
                <div className="size-1.5 rounded-full bg-slate-700" />
              </div>

              {/* Header Celular */}
              <div className="p-4 text-center space-y-2 bg-black/40 backdrop-blur-sm border-b border-white/10">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="size-14 mx-auto rounded-full object-cover border-2 border-brand/60 shadow-md" />
                ) : (
                  <div className="size-12 mx-auto rounded-full bg-brand/30 border border-brand/50 flex items-center justify-center font-black text-white text-base">
                    S
                  </div>
                )}

                <div>
                  <h4 className="font-extrabold text-base leading-tight">{headerTitle || "Menú Digital"}</h4>
                  <p className="text-[11px] text-slate-300/90 leading-tight mt-0.5">{headerSubtitle || "¡Pedí directamente desde tu celular!"}</p>
                </div>

                <Badge className="bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 text-[10px] mx-auto">
                  🪑 Mesa 01
                </Badge>
              </div>

              {/* Contenido Simulado */}
              <div className="p-3 flex-1 space-y-2 bg-black/20">
                <div className="h-7 bg-white/10 rounded-full px-3 flex items-center text-[10px] text-slate-400">
                  🔍 Buscar hamburguesa, bebida...
                </div>

                <div className="space-y-2 pt-1">
                  {[
                    { nombre: "Hamburguesa Saja Doble", precio: "$28.000 COP", desc: "Carne artesanal, queso cheddar, tocineta" },
                    { nombre: "Cerveza Club Colombia", precio: "$8.000 COP", desc: "Dorada 330 ml helada" },
                  ].map((p, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-white/10 border border-white/10 space-y-1">
                      <div className="flex justify-between font-bold text-[11px]">
                        <span>{p.nombre}</span>
                        <span className="text-brand-accent font-extrabold">{p.precio}</span>
                      </div>
                      <p className="text-[10px] text-slate-300 line-clamp-1">{p.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botón flotante pedido */}
              <div className="p-3 bg-black/60 backdrop-blur-md border-t border-white/10">
                <div className="bg-emerald-600 font-extrabold text-white text-center py-2 rounded-xl text-xs shadow-lg">
                  🛒 Ver mi pedido (1) · $28.000
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. GENERADOR Y DESCARGADOR DE CÓDIGOS QR
          ───────────────────────────────────────────────────────────── */}
      <div className="space-y-6 pt-6 border-t border-border">
        <div>
          <h3 className="text-base font-bold tracking-tight">
            {settings.deliveryEnabled !== false
              ? "Códigos QR para Mesas y Domicilios"
              : "Códigos QR para Mesas"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {settings.deliveryEnabled !== false
              ? "Imprimí estas tarjetas para tus mesas o compartí el enlace directo de domicilio."
              : "Imprimí estas tarjetas para los códigos QR de tus mesas."}
          </p>
        </div>

        {/* QR Domicilio / General (Solo si el negocio reparte a domicilio) */}
        {settings.deliveryEnabled !== false && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-bold text-sm">🛵 QR Menú Domicilios / Para Llevar</span>
                <p className="text-xs text-muted-foreground">El cliente ingresa su nombre, celular y dirección.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    ejecutarImpresion({
                      identificador: "DOMICILIOS Y PARA LLEVAR",
                      subtitulo: "Escaneá para hacer tu pedido a domicilio",
                      url: urlDomicilio,
                    })
                  }
                  className="text-xs font-semibold gap-1"
                >
                  🖨️ Imprimir Tarjeta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copiarEnlace(urlDomicilio, "domicilio")}
                  className="text-xs font-semibold"
                >
                  {copiado === "domicilio" ? "✔ ¡Copiado!" : "Copiar Enlace"}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(urlDomicilio)}`}
                alt="QR Domicilio"
                className="size-24 rounded-lg border border-border p-1 bg-white shrink-0 shadow-sm"
              />
              <div className="text-xs space-y-1.5 truncate">
                <span className="font-semibold block truncate text-foreground">{urlDomicilio}</span>
                <a
                  href={urlDomicilio}
                  target="_blank"
                  rel="noopener"
                  className="text-brand font-bold hover:underline inline-block"
                >
                  Abrir Menú Digital →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* QRs por Mesa */}
        {settings.mesas.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Códigos QR por Mesa ({settings.mesas.length})
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {settings.mesas.map((mesa) => {
                const urlMesa = `${appUrl}/m/${settings.slug}?mesa=${encodeURIComponent(mesa.name)}&tableId=${mesa.id}`;
                return (
                  <div key={mesa.id} className="rounded-xl border border-border/80 bg-card p-3 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">🪑 Mesa {mesa.name}</span>
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
                          className="h-7 text-xs font-semibold px-2"
                        >
                          🖨️ Imprimir
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copiarEnlace(urlMesa, mesa.id)}
                          className="h-7 text-xs font-semibold px-2"
                        >
                          {copiado === mesa.id ? "✔ ¡Copiado!" : "Copiar"}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(urlMesa)}`}
                        alt={`QR Mesa ${mesa.name}`}
                        className="size-20 rounded-md border border-border p-1 bg-white shrink-0 shadow-sm"
                      />
                      <div className="text-xs space-y-1 min-w-0">
                        <span className="text-muted-foreground block text-[11px]">Asigna automáticamente la mesa</span>
                        <a
                          href={urlMesa}
                          target="_blank"
                          rel="noopener"
                          className="text-brand font-semibold hover:underline block truncate"
                        >
                          Probar Menú →
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

      {/* ─────────────────────────────────────────────────────────────
          MODAL Y TARJETA DE IMPRESIÓN DE CÓDIGO QR CON IDENTIFICADOR
          ───────────────────────────────────────────────────────────── */}
      {tarjetaImprimir && (
        <Dialog open={!!tarjetaImprimir} onOpenChange={(open) => !open && setTarjetaImprimir(null)}>
          <DialogContent className="max-w-md p-6 text-center space-y-4 max-h-[90vh] overflow-y-auto">
            <DialogHeader className="no-print">
              <DialogTitle className="text-center font-extrabold text-lg">
                Tarjeta QR Imprimible
              </DialogTitle>
            </DialogHeader>

            {/* Contenedor Centrado Compacto (Sin Estirar) */}
            <div id="tarjeta-qr-print-wrapper" className="flex items-center justify-center p-2 w-full my-auto">
              <div
                id="tarjeta-qr-print"
                className="w-[290px] min-w-[290px] max-w-[290px] rounded-2xl border-2 border-slate-900 bg-white p-5 text-slate-950 flex flex-col items-center text-center space-y-3.5 shadow-xl shrink-0 mx-auto"
              >
                {/* Header / Logo */}
                <div className="flex flex-col items-center space-y-1 w-full">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="size-14 rounded-full object-cover border border-slate-300 shadow-sm block mx-auto"
                    />
                  ) : (
                    <div className="size-12 rounded-full bg-slate-900 text-white font-black flex items-center justify-center text-lg shadow-sm mx-auto">
                      {headerTitle ? headerTitle.slice(0, 2).toUpperCase() : "S"}
                    </div>
                  )}
                  <h3 className="font-black text-lg tracking-tight text-slate-900 leading-tight w-full truncate text-center">
                    {headerTitle || "Menú Digital"}
                  </h3>
                  <p className="text-[11px] text-slate-600 font-medium leading-tight max-w-[240px] mx-auto text-center">
                    {headerSubtitle || "Pedí directo desde tu celular"}
                  </p>
                </div>

                {/* Identificador Destacado Centrado */}
                <div className="w-full flex justify-center">
                  <div className="bg-slate-900 text-white py-1.5 px-4 rounded-xl font-black text-sm uppercase tracking-widest text-center shadow-md max-w-full truncate">
                    {tarjetaImprimir.identificador}
                  </div>
                </div>

                {/* Código QR Centrado Proporcional */}
                <div className="p-2.5 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center shadow-inner mx-auto">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(tarjetaImprimir.url)}`}
                    alt={tarjetaImprimir.identificador}
                    className="size-40 object-contain block mx-auto shrink-0"
                  />
                </div>

                {/* Instrucciones */}
                <div className="space-y-0.5 text-xs text-slate-700 w-full text-center">
                  <p className="font-extrabold text-slate-900 text-center text-xs">📱 Escaneá con tu celular</p>
                  <p className="text-[10.5px] text-slate-600 max-w-[230px] mx-auto leading-tight text-center">
                    {tarjetaImprimir.subtitulo}
                  </p>
                </div>

                {/* URL Footer */}
                <div className="w-full text-[9.5px] font-mono text-slate-500 border-t border-slate-200 pt-2 text-center truncate">
                  {tarjetaImprimir.url}
                </div>
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="flex gap-2 justify-end pt-2 no-print">
              <Button variant="outline" onClick={() => setTarjetaImprimir(null)} className="text-xs">
                Cerrar
              </Button>
              <Button onClick={() => ejecutarImpresion(tarjetaImprimir)} className="bg-brand text-white font-bold text-xs gap-1.5 shadow-md">
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
                  background: #ffffff !important;
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
  identificationDocumentCode?: string | null;
  legalOrganizationCode?: string | null;
  tributeCode?: string | null;
  responsibilities?: string | null;
};

export function FormularioFactus({ settings }: { settings: FactusSettings }) {
  const [estado, accion] = useActionState(guardarConfiguracionFactus, ESTADO_INICIAL);

  const habilitado = settings.facturacionElectronicaHabilitada;
  const disponibles = settings.paquetesDocumentosDisponibles ?? 0;
  const consumidos = settings.documentosEmitidosConsumidos ?? 0;
  const remanentes = Math.max(0, disponibles - consumidos);

  return (
    <div className="space-y-6">
      {!habilitado ? (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">🚫 Módulo de Facturación Electrónica DIAN Deshabilitado</span>
          </div>
          <p className="text-xs leading-relaxed opacity-90">
            La generación de facturas electrónicas con la API de Factus DIAN es una función opcional con costo adicional por paquete de documentos.
            Contacta a nuestro equipo comercial o de soporte desde el botón de ayuda para adquirir y desbloquear tu paquete de documentos electrónicamente.
          </p>
        </div>
      ) : (
        <form action={accion} className="space-y-6">
          {!estado.ok && estado.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}

          {estado.ok && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <AlertDescription>¡Configuración DIAN guardada con éxito!</AlertDescription>
            </Alert>
          )}

          {/* Tarjeta de Resumen de Paquete */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-brand/5 border border-brand/20 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Paquete Total</span>
              <p className="numeral text-2xl font-bold text-brand dark:text-[#3E9EA2]">{disponibles} <span className="text-xs font-normal">docs</span></p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Emitidos / Consumidos</span>
              <p className="numeral text-2xl font-bold text-foreground">{consumidos} <span className="text-xs font-normal">docs</span></p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">Remanentes</span>
              <p className="numeral text-2xl font-bold text-emerald-700 dark:text-emerald-400">{remanentes} <span className="text-xs font-normal">docs</span></p>
            </div>
          </div>

          {/* Formulario de Parámetros DIAN para esta Sede */}
          <div className="space-y-4 pt-2">
            <h3 className="font-semibold text-sm text-foreground">Parámetros de Facturación DIAN (Esta Sucursal)</h3>
            <p className="text-xs text-muted-foreground">
              Especifica los datos fiscales y rangos de resolución aprobados por la DIAN para esta sede.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="factusNumberingRangeId" className="text-xs font-semibold">ID Rango Numeración / Resolución DIAN *</Label>
                <Input
                  id="factusNumberingRangeId"
                  name="factusNumberingRangeId"
                  type="number"
                  defaultValue={settings.factusNumberingRangeId ?? ""}
                  placeholder="Ej. 389"
                  className="h-10 text-xs rounded-xl font-mono"
                  required
                />
                <span className="text-[11px] text-muted-foreground block">ID del rango activo obtenido en Factus para tus facturas.</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="municipalityCode" className="text-xs font-semibold">Código Municipio DANE / DIAN *</Label>
                <Input
                  id="municipalityCode"
                  name="municipalityCode"
                  defaultValue={settings.municipalityCode ?? "05001"}
                  placeholder="Ej. 68679 (Floridablanca) / 05001 (Medellín)"
                  className="h-10 text-xs rounded-xl font-mono"
                  required
                />
                <span className="text-[11px] text-muted-foreground block">Código DANE oficial de 5 dígitos del municipio de la sede.</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="legalOrganizationCode" className="text-xs font-semibold">Organización Jurídica *</Label>
                <select
                  id="legalOrganizationCode"
                  name="legalOrganizationCode"
                  defaultValue={settings.legalOrganizationCode ?? "1"}
                  className="w-full h-10 rounded-xl border border-input px-3 text-xs bg-background"
                >
                  <option value="1">1 - Persona Jurídica (Empresa / Sociedad SAS)</option>
                  <option value="2">2 - Persona Natural (Comerciante Individual)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="identificationDocumentCode" className="text-xs font-semibold">Tipo Documento de Identificación *</Label>
                <select
                  id="identificationDocumentCode"
                  name="identificationDocumentCode"
                  defaultValue={settings.identificationDocumentCode ?? "31"}
                  className="w-full h-10 rounded-xl border border-input px-3 text-xs bg-background"
                >
                  <option value="31">31 - NIT (Número de Identificación Tributaria)</option>
                  <option value="13">13 - Cédula de Ciudadanía</option>
                  <option value="22">22 - Cédula de Extranjería</option>
                  <option value="41">41 - Pasaporte</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tributeCode" className="text-xs font-semibold">Código de Tributo Principal DIAN *</Label>
                <select
                  id="tributeCode"
                  name="tributeCode"
                  defaultValue={settings.tributeCode ?? "ZZ"}
                  className="w-full h-10 rounded-xl border border-input px-3 text-xs bg-background"
                >
                  <option value="ZZ">ZZ - No aplica / Exento / Excluido</option>
                  <option value="01">01 - IVA (Impuesto al Valor Agregado 19%)</option>
                  <option value="04">04 - INC (Impuesto Nacional al Consumo 8%)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="responsibilities" className="text-xs font-semibold">Responsabilidad Fiscal DIAN *</Label>
                <select
                  id="responsibilities"
                  name="responsibilities"
                  defaultValue={settings.responsibilities ?? "R-99-PN"}
                  className="w-full h-10 rounded-xl border border-input px-3 text-xs bg-background"
                >
                  <option value="R-99-PN">R-99-PN - No responsable de IVA</option>
                  <option value="O-13">O-13 - Gran Contribuyente</option>
                  <option value="O-15">O-15 - Autorretenedor</option>
                  <option value="O-47">O-47 - Régimen Simple de Tributación (RST)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Enviar>Guardar Parámetros DIAN</Enviar>
          </div>
        </form>
      )}
    </div>
  );
}
