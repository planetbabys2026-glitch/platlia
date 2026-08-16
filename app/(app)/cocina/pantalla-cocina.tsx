"use client";

import { useEffect, useState } from "react";
import { EstacionGroup } from "@/features/cocina/queries";
import { Comanda } from "./comanda";
import { Flame } from "lucide-react";

export function PantallaCocina({
  initialEstaciones,
}: {
  initialEstaciones: EstacionGroup[];
}) {
  const [estaciones, setEstaciones] = useState<EstacionGroup[]>(initialEstaciones);

  useEffect(() => {
    setEstaciones(initialEstaciones);
  }, [initialEstaciones]);

  // Conexión SSE en tiempo real mediante Redis Pub/Sub (Cero polling HTTP)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/cocina/stream");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            (data.type === "init" || data.type === "update") &&
            Array.isArray(data.estaciones)
          ) {
            setEstaciones(data.estaciones);
          }
        } catch {
          // Ignorar errores de parseo
        }
      };
    } catch {
      // EventSource no soportado
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  const total = estaciones.reduce((n, e) => n + e.comandas.length, 0);

  return (
    <div className="space-y-8">
      {/* ─── Header Cocina KDS Dark Kitchen-Fire ─── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div>
          <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">
            Cocina KDS
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 font-sans">
            Pantalla de preparación en tiempo real · Semáforo de demoras y enrutamiento por estación.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="chip is-hot">
            <Flame className="size-3" />
            {total} {total === 1 ? "EN MARCHA" : "EN MARCHA"}
          </span>
        </div>
      </div>

      {estaciones.map((estacion) => (
        <section key={estacion.nombre} className="space-y-4">
          <div className="flex items-center gap-3 font-mono text-rotulo tracking-[0.16em] uppercase text-muted-foreground">
            <span>
              ESTACIÓN: {estacion.nombre.toUpperCase()} · <span className="numeral font-bold text-foreground">{estacion.comandas.length}</span> COMANDAS
            </span>
            <span className="flex-1 border-t border-dashed border-border/80" />
          </div>

          {/* `auto-fill` con mínimo de 22rem, como el export. Con la escalera de
              `grid-cols-N` la tarjeta quedaba en ~240px y "Cerveza nacional
              (Botella)" se partía en dos líneas: en una pantalla que se lee de
              lejos y de reojo, un nombre partido es un nombre que hay que leer.
              `auto-fill` y no `auto-fit` a propósito: con una sola comanda, la
              tarjeta se queda en su ancho en vez de estirarse a lo ancho del salón. */}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(22rem,100%),1fr))] gap-4">
            {estacion.comandas.map((comanda) => (
              <li key={comanda.id}>
                <Comanda comanda={comanda} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {total === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3 bg-card/40">
          <div className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
            ESTACIÓN AL DÍA
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            No hay comandas pendientes en este momento.
          </p>
          <p className="text-xs text-muted-foreground/80">
            Cuando el salón o el POS confirmen y envíen un pedido a cocina, aparecerá acá al instante.
          </p>
        </div>
      )}
    </div>
  );
}
