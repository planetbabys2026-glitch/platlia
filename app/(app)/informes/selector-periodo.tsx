"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import {
  ETIQUETA_TIPO,
  periodoAnterior,
  periodoSiguiente,
  TIPOS_DE_PERIODO,
  type Periodo,
  type TipoPeriodo,
} from "@/features/informes/periodo";
import { formatBusinessDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Con qué tramo de tiempo se está mirando el informe.
 *
 * Todo viaja en la URL —`periodo`, `jornada`, `desde`, `hasta`— y no en un
 * `useState`, por lo mismo que la sección: un informe es algo que se manda por
 * WhatsApp al contador, y un estado local no se puede enlazar. La sección
 * (`vista`) se conserva al cambiar de período, así que pasar de la semana al mes
 * no te saca de "Costos y margen".
 *
 * Se navega con `push` y no con `replace`, al revés que las pestañas de un
 * módulo: cambiar de mes SÍ es navegar, y "atrás" tiene que devolver al mes que
 * se estaba mirando.
 */
export function SelectorPeriodo({
  periodo,
  etiqueta,
  hoy,
  hayFuturo,
}: {
  periodo: Periodo;
  etiqueta: string;
  /** El día de negocio en curso, para el botón que vuelve al presente. */
  hoy: string;
  /** Si el tramo siguiente ya se pasó de hoy: no hay nada que mirar adelante. */
  hayFuturo: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(periodo.tipo === "rango");

  const desde = formatBusinessDate(periodo.desde);
  const hasta = formatBusinessDate(periodo.hasta);

  function ir(cambios: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) q.delete(clave);
      else q.set(clave, valor);
    }
    // El día es el período por defecto y no ensucia la URL, igual que la vista
    // inicial de un módulo.
    if (q.get("periodo") === "dia") q.delete("periodo");
    router.push(`/informes?${q.toString()}`);
  }

  function elegirTipo(tipo: TipoPeriodo) {
    if (tipo === "rango") {
      setAbierto(true);
      // El rango arranca con lo que ya se estaba mirando: pasar de "mes" a
      // "personalizado" no puede vaciar el informe y obligar a escribir dos
      // fechas desde cero.
      ir({ periodo: "rango", desde, hasta, jornada: null });
      return;
    }
    setAbierto(false);
    ir({ periodo: tipo, jornada: desde, desde: null, hasta: null });
  }

  /**
   * El tramo vecino se calcula acá, con el mismo módulo puro que usa el servidor,
   * y se navega a fechas concretas. La alternativa —mandar `?mover=-1` y que la
   * página lo interprete— dejaría un parámetro pegado en la URL que ya no
   * significa nada: al compartir el enlace, el informe se correría un tramo más
   * cada vez que alguien lo abre.
   */
  function mover(direccion: -1 | 1) {
    const vecino = direccion === -1 ? periodoAnterior(periodo) : periodoSiguiente(periodo);
    const d = formatBusinessDate(vecino.desde);
    const h = formatBusinessDate(vecino.hasta);
    ir(
      vecino.tipo === "rango"
        ? { periodo: "rango", desde: d, hasta: h, jornada: null }
        : { periodo: vecino.tipo, jornada: d, desde: null, hasta: null },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Los cinco tramos. Un `<select>` esconde las opciones detrás de un toque
            y acá son cinco palabras cortas que entran en una fila. */}
        <div
          role="group"
          aria-label="Tramo de tiempo"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--linea-16)] bg-[var(--panel)] p-1"
        >
          {TIPOS_DE_PERIODO.map((tipo) => {
            const activo = periodo.tipo === tipo;
            return (
              <button
                key={tipo}
                type="button"
                aria-pressed={activo}
                onClick={() => elegirTipo(tipo)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-mono text-rotulo uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  activo
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-[var(--panel-3)] hover:text-foreground",
                )}
              >
                {tipo === "rango" ? <CalendarRange aria-hidden className="size-3.5" /> : ETIQUETA_TIPO[tipo]}
                {tipo === "rango" && <span className="sr-only">{ETIQUETA_TIPO.rango}</span>}
              </button>
            );
          })}
        </div>

        {/* Las flechas mueven un tramo del mismo tamaño: un mes atrás desde un mes,
            una semana atrás desde una semana. Es lo que hace que comparar no exija
            calcular fechas. */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => mover(-1)}
            aria-label="Tramo anterior"
            className="inline-flex size-11 tableta:size-9 items-center justify-center rounded-xl border border-[var(--linea-16)] bg-[var(--panel)] text-muted-foreground transition-colors hover:bg-[var(--panel-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => mover(1)}
            disabled={!hayFuturo}
            aria-label="Tramo siguiente"
            className="inline-flex size-11 tableta:size-9 items-center justify-center rounded-xl border border-[var(--linea-16)] bg-[var(--panel)] text-muted-foreground transition-colors hover:bg-[var(--panel-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:hover:bg-[var(--panel)]"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <p className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground">{etiqueta}</span>
        </p>

        {!hayFuturo ? null : (
          <button
            type="button"
            onClick={() => ir({ periodo: periodo.tipo, jornada: hoy, desde: null, hasta: null })}
            className="rounded-xl border border-brand/50 bg-brand/10 px-3 py-1.5 font-mono text-rotulo uppercase tracking-[0.12em] text-brand transition-colors hover:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Volver a hoy
          </button>
        )}
      </div>

      {abierto && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--linea-16)] bg-[var(--panel)] p-3"
          action={(datos) => {
            const d = String(datos.get("desde") ?? "");
            const h = String(datos.get("hasta") ?? "");
            if (d && h) ir({ periodo: "rango", desde: d, hasta: h, jornada: null });
          }}
        >
          <CampoFecha nombre="desde" etiqueta="Desde" valor={desde} max={hoy} />
          <CampoFecha nombre="hasta" etiqueta="Hasta" valor={hasta} max={hoy} />
          <button
            type="submit"
            className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Ver el período
          </button>
        </form>
      )}
    </div>
  );
}

function CampoFecha({
  nombre,
  etiqueta,
  valor,
  max,
}: {
  nombre: string;
  etiqueta: string;
  valor: string;
  max: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block font-mono text-rotulo uppercase tracking-[0.12em] text-muted-foreground">
        {etiqueta}
      </span>
      <input
        type="date"
        name={nombre}
        defaultValue={valor}
        max={max}
        // El pozo del sistema: el campo es MÁS oscuro que el panel que lo
        // contiene, o desaparece dentro de él.
        className="rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-foreground focus:border-brand focus:bg-[var(--input-bg-focus)] focus-visible:outline-none"
      />
    </label>
  );
}
