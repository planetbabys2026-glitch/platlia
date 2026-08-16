"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Una categoría que se pliega.
 *
 * En un teléfono, una carta de 18 productos en lista corrida obliga a deslizar
 * hasta abajo para saber qué hay: la pantalla muestra tres platos y el resto es
 * fe. Plegada, la misma carta entra entera y el encabezado hace de índice.
 *
 * La animación va por `grid-template-rows: 0fr → 1fr`, que es lo único que llega
 * a la altura real del contenido sin medirla con JS: nada de `max-height` con un
 * número inventado que recorta la última tarjeta cuando la categoría crece.
 * `prefers-reduced-motion` la apaga —está en `globals.css`—, y el contenido
 * plegado se saca del árbol de accesibilidad con `hidden`, para que un lector de
 * pantalla no lea seis categorías cerradas de corrido.
 */
export function SeccionPlegable({
  titulo,
  cuenta,
  abiertaPorDefecto = true,
  children,
  className,
}: {
  titulo: string;
  /** Cuántos productos hay adentro. Es lo que hace útil el encabezado plegado. */
  cuenta?: number;
  abiertaPorDefecto?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const idContenido = useId();

  return (
    <section className={cn("space-y-3", className)}>
      <h2>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-controls={idContenido}
          className="group flex w-full items-center gap-3 rounded-lg py-1 text-left font-mono text-rotulo uppercase text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200",
              !abierta && "-rotate-90",
            )}
          />
          <span className="shrink-0">
            {titulo}
            {cuenta !== undefined && (
              <>
                {" · "}
                <span className="numeral font-bold text-foreground">{cuenta}</span>
              </>
            )}
          </span>
          {/* La guía punteada de la tirilla, que además marca hasta dónde llega
              la zona tocable del encabezado. */}
          <span aria-hidden className="h-px flex-1 border-t border-dashed border-[var(--linea-30)]" />
        </button>
      </h2>

      <div
        id={idContenido}
        // `inert` y no `hidden`: `hidden` es `display:none` y cortaría la animación
        // en seco. Así el contenido plegado deja de ser tabulable y de existir para
        // el lector de pantalla, pero sigue en el layout para poder animarse.
        inert={!abierta}
        aria-hidden={!abierta}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        {/* `min-h-0` es lo que deja que la fila del grid llegue a 0fr: sin eso el
            hijo impone su altura mínima y no se pliega nada. */}
        <div className="min-h-0 overflow-hidden">
          <div className="pb-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
