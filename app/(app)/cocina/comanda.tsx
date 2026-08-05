"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { avanzarComanda } from "@/features/cocina/actions";
import { MINUTOS_POR_DEFECTO } from "@/features/cocina/constantes";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { cn } from "@/lib/utils";

/**
 * Una comanda en la pantalla de cocina.
 *
 * La pantalla se mira de lejos y con las manos ocupadas: cifras grandes, un solo
 * botón por comanda y color que dice cuánto lleva esperando sin tener que leer.
 */

export type ComandaEnPantalla = {
  id: string;
  nombre: string;
  cantidad: number;
  notas: string | null;
  estado: string;
  /** Milisegundos desde época: se serializa sin problema al cliente. */
  desde: number;
  minutosEstimados: number | null;
  pedido: { code: number; mesa: string | null; turno: number | null };
};

/**
 * El color sale de comparar la espera contra lo que ese plato debería tardar, no
 * contra un número fijo: un cóctel de 6 minutos y una bandeja paisa de 25 no se
 * ponen en rojo al mismo tiempo.
 */
function colorDeEspera(minutos: number, estimado: number): string {
  if (minutos <= estimado) return "bg-espera-ok";
  if (minutos <= estimado * 1.5) return "bg-espera-atencion";
  if (minutos <= estimado * 2) return "bg-espera-demora";
  return "bg-espera-critico";
}

/** Minutos transcurridos, actualizados cada 15 segundos. */
function useMinutos(desde: number): number {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return Math.max(0, Math.floor((ahora - desde) / 60_000));
}

function Boton({ estado }: { estado: string }) {
  const { pending } = useFormStatus();
  const etiqueta = estado === "PENDIENTE" ? "Empezar" : "Listo";

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "focus-visible:ring-ring w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50",
        estado === "PENDIENTE"
          ? "bg-secondary text-secondary-foreground hover:bg-accent"
          : "bg-primary text-primary-foreground hover:bg-primary/80",
      )}
    >
      {pending ? "…" : etiqueta}
    </button>
  );
}

export function Comanda({ comanda }: { comanda: ComandaEnPantalla }) {
  const [estado, accion] = useActionState(avanzarComanda, ESTADO_INICIAL);
  const minutos = useMinutos(comanda.desde);
  const estimado = comanda.minutosEstimados ?? MINUTOS_POR_DEFECTO;

  return (
    <article
      className={cn(
        "border-border bg-card space-y-2 rounded-xl border p-3",
        comanda.estado === "EN_PREPARACION" && "border-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {comanda.pedido.mesa
            ? `Mesa ${comanda.pedido.mesa}`
            : comanda.pedido.turno !== null
              ? `Turno ${comanda.pedido.turno}`
              : `Pedido ${comanda.pedido.code}`}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", colorDeEspera(minutos, estimado))}
          />
          <span className="numeral text-xs">{minutos} min</span>
        </span>
      </div>

      <p className="text-lg leading-tight font-semibold">
        <span className="numeral">{comanda.cantidad}</span> {comanda.nombre}
      </p>

      {comanda.notas && (
        <p className="text-espera-demora text-sm font-medium">{comanda.notas}</p>
      )}

      <form action={accion}>
        <input type="hidden" name="itemId" value={comanda.id} />
        <Boton estado={comanda.estado} />
      </form>

      {!estado.ok && estado.error && (
        <p className="text-destructive text-xs">{estado.error}</p>
      )}
    </article>
  );
}

/**
 * Trae las comandas nuevas sin que nadie toque nada.
 *
 * Es un sondeo, no un stream: quince segundos de retraso en una cocina no se
 * notan, y el SSE de verdad —con su reconexión, su latido y su proxy que lo
 * bufferea— es una pieza que se justifica cuando la pantalla la miren varios
 * negocios a la vez, no antes.
 */
export function RefrescoAutomatico({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);

  return null;
}
