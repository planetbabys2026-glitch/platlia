"use client";

import { useId } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * El loader de Platlia: una comanda saliendo de la impresora.
 *
 * Es el isotipo en movimiento —la tirilla térmica dentada con el monograma—, no
 * un símbolo genérico girando. La hoja se alimenta a pasos desde la ranura, se
 * imprime la P, se traza la línea de acento, la comanda se desprende y arranca
 * la siguiente. Un bar mira salir ese papel decenas de veces por noche, así que
 * la espera del sistema se parece a la que ya conoce.
 *
 * Reemplazó a una animación Lottie de 14 KB con un resplandor de gradiente y un
 * anillo de vidrio: se veía igual que la de cualquier otro producto, y traía
 * `lottie-react` al bundle para dibujarla.
 *
 * Los colores salen de los tokens de marca en `globals.css`, no de este archivo:
 * el día que cambie la paleta, el loader cambia con ella.
 */

const RUTA_PAPEL =
  "M24 16H72V64L68 72L64 64L60 72L56 64L52 72L48 64L44 72L40 64L36 72L32 64L28 72L24 64Z";

const RUTA_P =
  "M42.2 44V20H47.9Q51.3 20 52.8 21.4Q54.3 22.7 54.4 25.9Q54.4 27.1 54.4 28.2Q54.4 29.3 54.4 30.5Q54.3 33.6 52.8 35Q51.3 36.4 47.9 36.4H46.7V44ZM46.7 32.4H47.9Q48.9 32.4 49.4 32Q49.8 31.6 49.9 30.8Q49.9 30 50 29.1Q50 28.2 50 27.3Q49.9 26.3 49.9 25.6Q49.8 24.8 49.4 24.4Q48.9 24 47.9 24H46.7Z";

export function Loader({
  lado = 96,
  /**
   * Un ciclo completo. Los 2400ms son la velocidad natural del gesto: más rápido
   * y el avance a pasos se lee como un parpadeo en vez de como papel saliendo.
   */
  duracion = 2400,
  etiqueta = "Cargando",
  className,
}: {
  lado?: number;
  duracion?: number;
  etiqueta?: string;
  className?: string;
}) {
  // `useId` devuelve ":r0:" y los dos puntos rompen `url(#id)` dentro de un
  // atributo de presentación.
  const uid = useId().replace(/:/g, "");
  const idAvance = `plt-avance-${uid}`;
  const idBarrido = `plt-barrido-${uid}`;

  return (
    <svg
      className={cn("plt-loader", className)}
      style={
        {
          "--plt-lado": `${lado}px`,
          "--plt-duracion": `${duracion}ms`,
        } as React.CSSProperties
      }
      viewBox="0 0 96 96"
      role="img"
      aria-label={etiqueta}
    >
      <defs>
        <clipPath id={idAvance}>
          <rect className="plt-avance" x="24" y="16" width="48" height="56" />
        </clipPath>
        <clipPath id={idBarrido}>
          <rect className="plt-barrido" x="42" y="20" width="13" height="24" />
        </clipPath>
      </defs>

      {/* La ranura de la impresora: aparece cuando hay hoja y se apaga al salir. */}
      <rect className="plt-ranura" x="23" y="14.4" width="50" height="1.6" rx="0.8" />

      <g className="plt-salida">
        <g clipPath={`url(#${idAvance})`}>
          <path className="plt-papel" d={RUTA_PAPEL} />
          <g clipPath={`url(#${idBarrido})`}>
            <path className="plt-p" d={RUTA_P} />
          </g>
          <rect className="plt-acento" x="36" y="52" width="24" height="5" />
        </g>
      </g>
    </svg>
  );
}

/**
 * El velo de una acción que está cambiando de pantalla.
 *
 * **Solo para eso.** Es `fixed inset-0` y se come todos los toques, así que
 * ponerlo en una acción que ocurre dentro de la pantalla que uno está mirando
 * —agregar un renglón, cambiar una cantidad— deja la aplicación tapada y muda
 * durante toda la espera, que es exactamente lo que hacía que la gente tocara
 * dos y tres veces. Para eso alcanza con que el botón muestre que está
 * trabajando.
 *
 * Se queda donde después de la acción uno termina en otro lado: abrir una mesa,
 * abrir un pedido sin mesa, liberar una mesa, cerrar una cuenta sin consumo.
 *
 * Lo que se ve mientras el servidor arma una pantalla es otra cosa y vive en
 * `components/ui/esqueleto-pantalla.tsx`: este componente no sirve para un
 * `loading.tsx` —sin formulario alrededor, `useFormStatus()` es `false` y no
 * dibuja nada—.
 *
 * **La página se sigue viendo detrás, desenfocada.** No es decoración: quien
 * espera no pierde el lugar donde estaba, y el desenfoque dice "esto está
 * inerte" sin borrar el contexto. Con un velo opaco, cada espera es un salto a
 * ninguna parte y hay que reconstruir dónde se estaba al volver.
 */
/**
 * Lo que se ve al cambiar de módulo y al entrar al panel.
 *
 * Va en los `loading.tsx`, que es el único lugar donde Next sabe que la pantalla
 * siguiente todavía no llegó. Es un velo y no solo un esqueleto porque el salto
 * entre módulos es el momento en que más se nota si el producto responde o no:
 * un `<main>` en blanco durante 400ms se lee como una pantalla rota.
 *
 * **El esqueleto sigue debajo, y por eso el desenfoque tiene qué desenfocar.**
 * Sin él, detrás del velo no habría más que fondo plano y el efecto sería un
 * rectángulo oscuro; con él se adivina la forma de lo que está por llegar, así
 * que la espera ya empieza a contar de qué pantalla se trata. Es además la red
 * si el navegador no soporta `backdrop-filter`: queda el esqueleto de siempre.
 */
export function VeloDeCarga({ pie }: { pie?: string }) {
  return (
    <div role="status" aria-live="polite" className="plt-velo select-none">
      <Loader lado={132} etiqueta={pie ?? "Cargando"} />
      {pie ? <p className="plt-velo-pie">{pie}</p> : null}
    </div>
  );
}

export function PantallaCargando({
  forcePending = false,
  pie,
}: {
  forcePending?: boolean;
  /** Qué está pasando, en dos o tres palabras. Opcional. */
  pie?: string;
}) {
  const { pending } = useFormStatus();
  const activo = forcePending || pending;

  if (!activo) return null;

  return (
    <div role="status" aria-live="polite" className="plt-velo select-none">
      <Loader lado={132} etiqueta={pie ?? "Procesando"} />
      {pie ? <p className="plt-velo-pie">{pie}</p> : null}
    </div>
  );
}
