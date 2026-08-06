"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { avanzarComanda } from "@/features/cocina/actions";
import { MINUTOS_POR_DEFECTO } from "@/features/cocina/constantes";
import { ComandaItem, ComandaOrden } from "@/features/cocina/queries";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

function colorDeEspera(minutos: number, estimado: number): string {
  if (minutos <= estimado) return "bg-espera-ok";
  if (minutos <= estimado * 1.5) return "bg-espera-atencion";
  if (minutos <= estimado * 2) return "bg-espera-demora";
  return "bg-espera-critico";
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
        "rounded-md px-2.5 py-1 text-xs font-semibold transition-all focus-visible:outline-none disabled:opacity-50",
        estado === "PENDIENTE"
          ? "bg-secondary text-secondary-foreground hover:bg-accent"
          : estado === "EN_PREPARACION"
            ? "bg-brand text-brand-foreground hover:bg-brand/80"
            : "bg-emerald-600 text-white hover:bg-emerald-700",
      )}
    >
      {pending ? "…" : (SIGUIENTE_PASO[estado] ?? "Avanzar")}
    </button>
  );
}

function RenglonComanda({ item }: { item: ComandaItem }) {
  const [estado, accion] = useActionState(avanzarComanda, ESTADO_INICIAL);

  return (
    <div className="border-border/60 space-y-1.5 border-b py-2.5 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-base font-semibold leading-snug">
            <span className="text-brand font-bold mr-1">{item.quantity}x</span> {item.nameSnapshot}
          </p>
          {item.notes && (
            <div className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <span className="shrink-0">📝</span>
              <span className="leading-tight">{item.notes}</span>
            </div>
          )}
        </div>

        <form action={accion} className="shrink-0">
          <input type="hidden" name="itemId" value={item.id} />
          <BotonRenglon estado={item.status} />
        </form>
      </div>

      {!estado.ok && estado.error && (
        <p className="text-destructive text-xs">{estado.error}</p>
      )}
    </div>
  );
}

export function Comanda({ comanda }: { comanda: ComandaOrden }) {
  const minutos = useMinutos(comanda.desde);
  const maxEstimado = Math.max(
    ...comanda.items.map((i) => i.preparationMinutes ?? MINUTOS_POR_DEFECTO),
    MINUTOS_POR_DEFECTO,
  );

  const tituloMesaOOrder = comanda.mesa
    ? `Mesa ${comanda.mesa}${comanda.turno !== null ? ` · ${formatTurno(comanda.turno, 99, true)}` : ""}`
    : comanda.turno !== null
      ? `Turno ${formatTurno(comanda.turno, 99, false)}`
      : `Pedido #${comanda.code}`;

  return (
    <article
      className={cn(
        "border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md",
        comanda.items.some((i) => i.status === "EN_PREPARACION") && "border-brand/60 ring-1 ring-brand/20",
        comanda.items.every((i) => i.status === "LISTO") && "border-emerald-500/40 bg-emerald-500/5 opacity-80",
      )}
    >
      {/* Header de la Comanda por Mesa / Pedido */}
      <div className="border-border/80 flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-bold tracking-tight">
            {tituloMesaOOrder}
          </span>
          {comanda.items.every((i) => i.status === "LISTO") && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              ✔ LISTO
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full animate-pulse", colorDeEspera(minutos, maxEstimado))}
          />
          <span className="numeral text-xs font-semibold">{minutos} min</span>
        </span>
      </div>

      {/* Lista de Productos de la Comanda */}
      <div className="space-y-1">
        {comanda.items.map((item) => (
          <RenglonComanda key={item.id} item={item} />
        ))}
      </div>
    </article>
  );
}

export function RefrescoAutomatico({ segundos = 10 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);

  return null;
}
