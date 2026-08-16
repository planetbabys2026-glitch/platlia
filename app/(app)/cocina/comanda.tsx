"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { avanzarComanda } from "@/features/cocina/actions";
import { MINUTOS_POR_DEFECTO } from "@/features/cocina/constantes";
import { ComandaItem, ComandaOrden } from "@/features/cocina/queries";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

/**
 * La comanda, como la tirilla que el cocinero tendría en la mano.
 *
 * Banda de encabezado, línea de corte punteada entre platos y el destino en la
 * misma letra con la que el salón escribe el número de mesa. No es decoración:
 * a un metro de la pantalla y de reojo, lo único que hay que poder leer es
 * A DÓNDE VA y HACE CUÁNTO ESPERA.
 */

type Retraso = "ok" | "tarde" | "critico";

function retrasoDe(minutos: number, estimado: number): Retraso {
  if (minutos <= estimado) return "ok";
  if (minutos <= estimado * 2) return "tarde";
  return "critico";
}

function useMinutos(desde: number): number {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return Math.max(0, Math.floor((ahora - desde) / 60_000));
}

const SIGUIENTE_PASO: Record<string, string> = {
  PENDIENTE: "Empezar",
  EN_PREPARACION: "Listo",
  LISTO: "Entregar",
};

function BotonRenglon({ estado }: { estado: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50",
        estado === "PENDIENTE"
          ? "border border-[var(--linea-30)] bg-transparent text-foreground hover:bg-[var(--panel-3)]"
          : estado === "EN_PREPARACION"
            ? "bg-brand text-brand-foreground hover:bg-brand/90"
            : "bg-success text-success-foreground hover:bg-success/90",
      )}
    >
      {pending ? "…" : (SIGUIENTE_PASO[estado] ?? "Avanzar")}
    </button>
  );
}

function RenglonComanda({ item }: { item: ComandaItem }) {
  const [estado, accion] = useActionState(avanzarComanda, ESTADO_INICIAL);
  const listo = item.status === "LISTO";

  return (
    // La línea de corte: punteada, como la perforación de la tirilla.
    <div className="border-t border-dashed border-[var(--linea-16)] py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className={cn("text-base leading-snug", listo && "text-muted-foreground line-through")}>
            <span className="numeral mr-1.5 font-bold text-brand">{item.quantity}x</span>
            <span className="font-semibold">{item.nameSnapshot}</span>
          </p>

          {item.modificadores.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.modificadores.map((mod, i) => (
                <span
                  key={`${item.id}-${i}`}
                  className="rounded-md border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-xs font-bold text-brand"
                >
                  {mod}
                </span>
              ))}
            </div>
          )}

          {item.notes && (
            <p className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/15 px-2 py-1 text-xs font-semibold text-warning-soft">
              <span aria-hidden className="shrink-0">
                📝
              </span>
              <span className="leading-tight">{item.notes}</span>
            </p>
          )}
        </div>

        <form action={accion}>
          <input type="hidden" name="itemId" value={item.id} />
          <BotonRenglon estado={item.status} />
        </form>
      </div>

      {!estado.ok && estado.error && <p className="pt-1 text-xs text-destructive-soft">{estado.error}</p>}
    </div>
  );
}

export function Comanda({ comanda }: { comanda: ComandaOrden }) {
  const minutos = useMinutos(comanda.desde);
  const maxEstimado = Math.max(
    ...comanda.items.map((i) => i.preparationMinutes ?? MINUTOS_POR_DEFECTO),
    MINUTOS_POR_DEFECTO,
  );
  const retraso = retrasoDe(minutos, maxEstimado);
  const todoListo = comanda.items.every((i) => i.status === "LISTO");

  // Dónde va el plato. La mesa manda; sin mesa, el turno que se canta.
  const destino = comanda.mesa
    ? `Mesa ${comanda.mesa}`
    : comanda.turno !== null
      ? `Turno ${formatTurno(comanda.turno, 99, false)}`
      : `Pedido #${comanda.code}`;

  // De quién es. Una mesa puede tener tres cuentas abiertas a la vez y cada una
  // llega como su propia comanda: sin el nombre, al cocinero le aparecen tres
  // tarjetas que dicen "Mesa 12" y no sabe cuál plato va para quién.
  const cuenta = comanda.cuenta?.trim() || null;

  const turnoDeMesa =
    comanda.mesa && comanda.turno !== null ? formatTurno(comanda.turno, 99, true) : null;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-[var(--panel)] transition-colors",
        // El borde dice UNA cosa: si esta comanda ya se pasó de tiempo. Antes se
        // encendía cuando alguien tocaba "Empezar", que es lo normal y no una alerta.
        retraso === "critico"
          ? "border-destructive"
          : retraso === "tarde"
            ? "border-brand"
            : "border-[var(--linea-16)]",
        todoListo && "opacity-75",
      )}
    >
      {/* Banda de encabezado, como la cabecera impresa de la tirilla. */}
      <div className="flex items-start justify-between gap-3 border-b border-dashed border-[var(--linea-30)] bg-[var(--panel-2)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-2xl font-black uppercase leading-none tracking-tight text-foreground">
            {destino}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {cuenta && <span className="truncate text-xs font-semibold text-brand">{cuenta}</span>}
            {turnoDeMesa && (
              <span className="numeral text-rotulo text-muted-foreground">{turnoDeMesa}</span>
            )}
          </div>
        </div>

        <p
          className={cn(
            "numeral flex shrink-0 items-center gap-1.5 text-sm font-bold",
            retraso === "critico"
              ? "text-destructive-soft"
              : retraso === "tarde"
                ? "text-brand"
                : "text-foreground",
          )}
        >
          {/* El punto late SOLO cuando hay algo que mirar. Antes latía siempre, y
              una alarma que suena todo el tiempo deja de ser una alarma. */}
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              retraso === "critico"
                ? "animate-pulse bg-destructive"
                : retraso === "tarde"
                  ? "animate-pulse bg-brand"
                  : "bg-success",
            )}
          />
          <span className="sr-only">Esperando hace </span>
          {minutos} min
        </p>
      </div>

      {comanda.notes && (
        <p className="flex items-start gap-1.5 border-b border-dashed border-[var(--linea-16)] bg-warning/10 px-4 py-2 text-xs font-semibold text-warning-soft">
          <span aria-hidden className="shrink-0">
            📌
          </span>
          <span className="leading-tight">{comanda.notes}</span>
        </p>
      )}

      <div className="flex-1 px-4 py-2">
        {comanda.items.map((item) => (
          <RenglonComanda key={item.id} item={item} />
        ))}
      </div>

      {/* El sello. Es el único gesto fuerte de la pantalla y se lo gana: es lo que
          una cocina hace físicamente con una comanda terminada. Va en el pie y no
          encima de la tarjeta para no tapar el botón de "Entregar", que todavía
          hay que poder tocar. */}
      {todoListo && (
        <p className="flex justify-center border-t border-dashed border-[var(--linea-30)] px-4 py-2.5">
          <span className="animate-stamp-in rounded border-2 border-success-soft px-3 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.18em] text-success-soft">
            Listo
          </span>
        </p>
      )}
    </article>
  );
}
