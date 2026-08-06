"use client";

import { useEffect, useState } from "react";
import { EstacionGroup } from "@/features/cocina/queries";
import { Comanda } from "./comanda";

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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Cocina</h1>
        <p className="text-muted-foreground text-sm">
          {total === 0
            ? "Todo despachado."
            : `${total} ${total === 1 ? "comanda pendiente" : "comandas pendientes"}.`}
        </p>
      </div>

      {estaciones.map((estacion) => (
        <section key={estacion.nombre} className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-bold tracking-[0.15em] uppercase">
            {estacion.nombre} · {estacion.comandas.length}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {estacion.comandas.map((comanda) => (
              <li key={comanda.id}>
                <Comanda comanda={comanda} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {total === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <p className="text-muted-foreground text-sm font-medium">
            No hay comandas pendientes en este momento.
          </p>
          <p className="text-xs text-muted-foreground">
            Cuando el salón o el POS confirmen y envíen un pedido a cocina, aparecerá acá en tiempo real.
          </p>
        </div>
      )}
    </div>
  );
}
