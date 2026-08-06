"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ReceiptWidth } from "@/generated/prisma/enums";
import { guardarDatosNegocio, guardarModulos, guardarOperacion, guardarTurneroSettings } from "@/features/negocio/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

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
}: {
  mesasHabilitado: boolean;
  deliveryEnabled: boolean;
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
