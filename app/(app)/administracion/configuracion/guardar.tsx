"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * La barra de guardado de Configuración.
 *
 * Existe por un defecto concreto: **las pantallas de acá parecían guardadas sin
 * estarlo.** Son formularios largos —el del menú QR mide seiscientas líneas— con
 * el botón al final, así que se toca una casilla, se ve cambiar, se sale, y no se
 * guardó nada. En Permisos de roles era peor todavía: el contador del rol pasaba
 * de 3/12 a 4/12, aparecía la insignia "Personalizado" y el pie decía "los
 * cambios se aplican de inmediato" —tres confirmaciones para algo que no había
 * pasado—, en la única pantalla del producto que decide quién entra a dónde.
 *
 * La barra se pega abajo y **está siempre**, no solo cuando hay cambios: el
 * defecto era justamente que el botón quedaba fuera de pantalla, y una barra que
 * aparece y desaparece deja el mismo problema la mitad del tiempo. Quieta dice
 * "sin cambios" con el botón apagado, así que ocupa lugar pero nunca miente sobre
 * el estado.
 *
 * El resultado se pinta ACÁ y no arriba del formulario, que es donde estaba: con
 * el botón abajo y la confirmación arriba, uno guardaba y no veía nada.
 */
export function BarraGuardar({
  sucio,
  estado,
  children,
}: {
  /** Si lo que hay en pantalla difiere de lo guardado. */
  sucio: boolean;
  estado: { ok: boolean; error?: string };
  /** Qué dice el botón. Un verbo y el objeto: "Guardar módulos". */
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const guardado = estado.ok && !sucio;

  return (
    <div
      className={cn(
        // El sangrado usa la MISMA variable que el padding de `CardContent`
        // (`px-(--card-spacing)`) y no un `-mx-4 sm:-mx-6` a ojo: con la tarjeta
        // en `overflow-visible` —hace falta para que `sticky` funcione— un
        // margen negativo que no coincide con el padding ya no se recorta, se
        // desborda a la vista.
        "sticky bottom-0 z-10 -mx-(--card-spacing) mt-2 px-(--card-spacing)",
        "border-t border-dashed border-[var(--linea-30)] pb-4 pt-3",
        // El fondo tapa el contenido que pasa por debajo al desplazar; sin él la
        // barra se lee encima del formulario y no se entiende qué es.
        "bg-[var(--panel)]/95 backdrop-blur-sm",
      )}
    >
      {!estado.ok && estado.error ? (
        <p
          role="alert"
          className="mb-2.5 flex items-start gap-2 text-sm text-destructive-soft"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {estado.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-rotulo uppercase tracking-[0.12em] text-muted-foreground">
          {pending ? (
            "Guardando…"
          ) : sucio ? (
            // Decir qué pasa si se va, no un "tenés cambios" que no acciona nada.
            <span className="text-warning-soft">Sin guardar · se pierde al salir</span>
          ) : guardado ? (
            <span className="inline-flex items-center gap-1.5 text-success-soft">
              <Check aria-hidden className="size-3.5" />
              Guardado
            </span>
          ) : (
            "Sin cambios"
          )}
        </p>

        <Button type="submit" disabled={pending || !sucio} className="font-bold">
          {pending ? "Guardando…" : children}
        </Button>
      </div>
    </div>
  );
}

/**
 * Si lo que hay en pantalla difiere de lo guardado, para un formulario nativo.
 *
 * Escucha los eventos del formulario en vez de comparar valor por valor: son
 * siete formularios con campos de todo tipo —color, archivo, rango, casilla— y
 * mantener una copia del estado de cada uno sería siete oportunidades de que la
 * copia y el campo se separen.
 *
 * **Se limpia cuando TERMINA un envío exitoso, no cuando `estado.ok` es true.**
 * Ese booleano se queda pegado: después del primer guardado vale `true` para
 * siempre, así que un `useEffect` con `[estadoOk]` no se vuelve a disparar nunca
 * y del segundo guardado en adelante la barra seguía diciendo "sin guardar" con
 * todo ya guardado. La transición de `pending` sí ocurre en cada envío.
 *
 * No se limpia al enviar sino al terminar: si la acción falla, lo escrito sigue
 * sin guardarse y la barra tiene que seguir diciéndolo.
 */
export function useSucio(estadoOk: boolean, pendiente: boolean) {
  const [sucio, setSucio] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    if (enviando.current && !pendiente && estadoOk) setSucio(false);
    enviando.current = pendiente;
  }, [pendiente, estadoOk]);

  return {
    sucio,
    /** Va en `onChange` y en `onInput` del `<form>`: los dos, porque `onChange`
     *  de React no salta en un `<input type="range">` mientras se arrastra. */
    marcar: () => setSucio(true),
  };
}

/**
 * Lo mismo, para un formulario cuyo estado vive en React y no en los campos.
 *
 * Devuelve si lo que hay en pantalla difiere de lo último GUARDADO, y mueve esa
 * referencia en cada envío exitoso. Comparar contra la instantánea de apertura
 * —que es lo que hacía— dejaba el botón apagado para siempre después del primer
 * guardado: había que recargar la página para poder volver a guardar.
 */
export function useSucioPorValor(instantanea: string, estadoOk: boolean, pendiente: boolean) {
  const [guardada, setGuardada] = useState(instantanea);
  // Lo que se mandó al servidor, capturado al arrancar el envío. No se lee el
  // valor de pantalla al terminar: si alguien sigue tocando mientras guarda, ese
  // cambio nuevo no viajó y no puede darse por guardado.
  const enviada = useRef<string | null>(null);

  useEffect(() => {
    if (pendiente) {
      enviada.current = instantanea;
      return;
    }
    if (enviada.current !== null && estadoOk) {
      setGuardada(enviada.current);
    }
    enviada.current = null;
  }, [pendiente, estadoOk, instantanea]);

  return instantanea !== guardada;
}
