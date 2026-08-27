"use client";

import { createContext, useContext, useEffect, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Un grupo de categorías donde solo una está abierta a la vez.
 *
 * Es lo que evita el muro: una carta de cinco categorías desplegadas obliga a
 * deslizar por delante de todo lo que no se está buscando. Abriendo de a una, la
 * pantalla siempre muestra el índice completo más el bloque que a alguien le
 * interesa, y elegir es leer seis títulos en vez de cuarenta platos.
 *
 * Va por contexto y no por props porque las tres pantallas que lo usan —el POS,
 * la carta de la mesa y el menú QR— recorren sus categorías con un `map`:
 * pasarles el estado a mano obligaba a repetir el mismo `useState` tres veces y
 * a que las tres se acordaran de coordinarlo igual.
 */
const ContextoAcordeon = createContext<{
  abierta: string | null;
  alternar: (id: string) => void;
} | null>(null);

export function Acordeon({ children }: { children: React.ReactNode }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const valor = useMemo(
    () => ({
      abierta,
      // Volver a tocar la abierta la cierra: si no, no habría forma de dejar la
      // pantalla en el índice limpio una vez que se encontró lo que se buscaba.
      alternar: (id: string) => setAbierta((actual) => (actual === id ? null : id)),
    }),
    [abierta],
  );

  return <ContextoAcordeon.Provider value={valor}>{children}</ContextoAcordeon.Provider>;
}

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
 *
 * **El recorte dura lo que dura la animación, y ni un instante más.** El
 * `overflow-hidden` es obligatorio para que `0fr` de verdad esconda algo, pero
 * mientras está puesto recorta todo lo que un hijo saque de la caja: el
 * `hover:scale` de las tarjetas de producto se ve rebanado en la primera y la
 * última columna, y la insignia de cantidad —que va en `-top-2 -right-2`— queda
 * cortada por la mitad en la fila de arriba. Por eso, con la sección abierta y la
 * animación terminada, el desborde vuelve a ser visible.
 */
export function SeccionPlegable({
  id,
  titulo,
  cuenta,
  abiertaPorDefecto = false,
  children,
  className,
}: {
  /**
   * Con qué se la identifica dentro de un `<Acordeon>`. Sin esto —o fuera del
   * acordeón— la sección se pliega sola, sin coordinarse con sus hermanas.
   */
  id?: string;
  titulo: string;
  /** Cuántos productos hay adentro. Es lo que hace útil el encabezado plegado. */
  cuenta?: number;
  /**
   * Arranca cerrada.
   *
   * Antes arrancaban todas abiertas y la carta entera caía de golpe: dieciocho
   * platos de corrido donde alguien busca uno. Cerradas, el encabezado hace de
   * índice y la primera pantalla cabe entera.
   */
  abiertaPorDefecto?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const grupo = useContext(ContextoAcordeon);
  const enGrupo = grupo !== null && id !== undefined;
  const [abiertaLocal, setAbiertaLocal] = useState(abiertaPorDefecto);

  const abierta = enGrupo ? grupo.abierta === id : abiertaLocal;
  const alternar = () => {
    if (enGrupo) grupo.alternar(id);
    else setAbiertaLocal((v) => !v);
  };
  /**
   * Si el contenido puede salirse de la caja ahora mismo.
   *
   * Va por estado y no por CSS porque las dos transiciones son asimétricas: al
   * abrir hay que esperar a que la animación termine —si no, el contenido se
   * derrama fuera de una fila que todavía mide cero—, y al cerrar hay que recortar
   * ANTES de que arranque, o el primer cuadro muestra la categoría entera
   * desbordada sobre la de abajo.
   */
  const [desbordeVisible, setDesbordeVisible] = useState(abiertaPorDefecto);
  const idContenido = useId();

  useEffect(() => {
    if (!abierta) {
      setDesbordeVisible(false);
      return;
    }
    // Un temporizador y no `transitionend`: con `prefers-reduced-motion` la
    // transición no existe y ese evento no llega nunca, así que el desborde se
    // quedaría recortado para siempre justo en el equipo de quien pidió menos
    // movimiento. El margen sobre los 300ms es para el cuadro de cierre.
    const t = setTimeout(() => setDesbordeVisible(true), 350);
    return () => clearTimeout(t);
  }, [abierta]);

  return (
    <section className={cn("space-y-3", className)}>
      <h2>
        <button
          type="button"
          onClick={alternar}
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
        <div className={cn("min-h-0", desbordeVisible ? "overflow-visible" : "overflow-hidden")}>
          <div className="pb-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
