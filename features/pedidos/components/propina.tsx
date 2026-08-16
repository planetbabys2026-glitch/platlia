"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCop } from "@/lib/money";
import { formatRateBp } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * La propina, al momento de cobrar.
 *
 * Existía todo menos esto: `BusinessSettings.tipSuggestionEnabled` y
 * `tipSuggestionRateBp` se editaban en Configuración, `computeSuggestedTip` está
 * en `lib/tax.ts` con sus tests y `Order.tipCop` entra en `recalcularTotales`, en
 * la tirilla y en Informes. No había una sola pantalla que la ofreciera, así que
 * el interruptor de Configuración era decorativo y `tipCop` era siempre 0.
 *
 * **Arranca en "Sin propina", a propósito.** En Colombia la propina es voluntaria
 * y hay que preguntarla antes de sumarla —lo dice el propio comentario de
 * `lib/tax.ts`—: dejarla preseleccionada es exactamente lo que esa regla evita.
 * Sugerirla es ofrecerla de un toque, no cobrarla por defecto.
 *
 * Se comparte entre Caja y POS para que la propina no termine calculándose de dos
 * maneras distintas según por dónde se cobre.
 */

export type PropinaProps = {
  /** Si el negocio la sugiere. Con esto apagado no se dibuja nada. */
  habilitado: boolean;
  /** Cuánto sería la propina sugerida, ya calculada con `computeSuggestedTip`. */
  sugeridaCop: number;
  /** La tarifa sugerida en puntos básicos, solo para rotular el botón. */
  rateBp: number;
  /** Lo elegido. `0` es sin propina. */
  valorCop: number;
  onCambiar: (valorCop: number) => void;
  /** Para que dos formularios abiertos a la vez no compartan ids. */
  id: string;
  /**
   * El menú QR no se pinta con la paleta de la aplicación: el fondo y el acento
   * los elige cada negocio. Es el mismo componente —una sola cuenta y un solo
   * comportamiento— con la piel que corresponde.
   */
  tema?: "app" | "qr";
};

export function SelectorDePropina({
  habilitado,
  sugeridaCop,
  rateBp,
  valorCop,
  onCambiar,
  id,
  tema = "app",
}: PropinaProps) {
  // "Otro" es una elección de la persona, no un estado derivado: si se dedujera
  // de que el valor no coincide con la sugerencia, escribir un monto igual a la
  // sugerencia cerraría el campo de golpe mientras se escribe.
  const [otro, setOtro] = useState(false);

  if (!habilitado || sugeridaCop <= 0) return null;

  const elegir = (valor: number) => {
    setOtro(false);
    onCambiar(valor);
  };

  const sinPropina = !otro && valorCop === 0;
  const conSugerida = !otro && valorCop === sugeridaCop;

  return (
    <div className="space-y-2">
      <Label
        className={cn(
          "font-mono text-rotulo uppercase tracking-wider",
          tema === "qr" ? "text-[color:var(--qr-texto-2)]" : "text-muted-foreground",
        )}
      >
        Propina · voluntaria
      </Label>

      <div className="grid grid-cols-3 gap-1.5">
        <Opcion tema={tema} activa={sinPropina} onClick={() => elegir(0)}>
          Sin propina
        </Opcion>
        <Opcion tema={tema} activa={conSugerida} onClick={() => elegir(sugeridaCop)}>
          {formatRateBp(rateBp)}
          <span className="numeral ml-1.5 font-bold">{formatCop(sugeridaCop)}</span>
        </Opcion>
        <Opcion
          tema={tema}
          activa={otro}
          onClick={() => {
            setOtro(true);
            onCambiar(0);
          }}
        >
          Otro monto
        </Opcion>
      </div>

      {otro && (
        <Input
          id={`propina-${id}`}
          inputMode="numeric"
          autoFocus
          aria-label="Monto de la propina"
          value={valorCop === 0 ? "" : String(valorCop)}
          onChange={(e) => onCambiar(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
          placeholder="0"
          className={cn(
            "numeral h-11 text-sm tableta:h-10",
            tema === "qr" &&
              "border-white/20 bg-white/10 text-[color:var(--qr-texto)] placeholder:text-[color:var(--qr-texto-3)]",
          )}
        />
      )}
    </div>
  );
}

function Opcion({
  activa,
  onClick,
  children,
  tema,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tema: "app" | "qr";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "min-h-11 rounded-lg border px-2.5 py-2 text-center text-xs font-medium transition-all tableta:min-h-9",
        tema === "qr"
          ? activa
            ? "border-[var(--qr-acento)] bg-[var(--qr-acento)]/20 font-bold text-[color:var(--qr-acento-texto)]"
            : "border-white/15 bg-white/5 text-[color:var(--qr-texto-2)] hover:bg-white/10"
          : activa
            ? "border-[var(--brasa)] bg-[var(--brasa)]/15 font-bold text-[var(--brasa)] ring-1 ring-[var(--brasa)]/30"
            : "border-[var(--linea-30)] bg-[var(--panel-2)] text-[var(--papel)] hover:bg-[var(--panel-3)]",
      )}
    >
      {children}
    </button>
  );
}
