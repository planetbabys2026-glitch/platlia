import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Las piezas con las que se escribe una guía.
 *
 * Existen porque el proyecto **no tiene `@tailwindcss/typography`**: las clases
 * `prose` que usa la página de habeas data no hacen nada, y por eso ahí cada
 * elemento lleva sus clases escritas a mano. Repetir eso en cinco guías largas
 * garantiza que a la tercera los `h2` dejen de medir lo mismo.
 *
 * La escala es la del manual —`text-base` son 17px y es lo que se lee primero,
 * `text-sm` son 15 y es el cuerpo—, pero acá el cuerpo va en `text-base`: esto
 * se lee de corrido durante siete minutos, no se escanea como una pantalla de
 * trabajo.
 */

/** Un párrafo. */
export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-base leading-relaxed text-[var(--linea)]">{children}</p>
  );
}

/** Encabezado de sección. Es lo que arma el índice y lo que lee un buscador. */
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 pt-4 font-display text-2xl font-black uppercase leading-tight tracking-tight text-[var(--papel)] sm:text-3xl"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-2 text-lg font-semibold tracking-tight text-[var(--papel)]">
      {children}
    </h3>
  );
}

export function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-3 text-base leading-relaxed text-[var(--linea)]"
        >
          <span
            aria-hidden
            className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-[var(--brasa)]"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ListaNumerada({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-3.5 text-base leading-relaxed text-[var(--linea)]"
        >
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--brasa)]/15 font-mono text-rotulo font-bold text-[var(--brasa)]"
          >
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Una cita textual de la ley o de una resolución.
 *
 * Va marcada como cita y no como párrafo en cursiva porque lo es: quien lee esto
 * tiene que poder distinguir de un vistazo qué dice la norma y qué opinamos
 * nosotros. `cite` lleva la URL de la fuente.
 */
export function Norma({
  children,
  fuente,
  url,
}: {
  children: ReactNode;
  fuente: string;
  url: string;
}) {
  return (
    <figure className="my-2 border-l-2 border-dashed border-[var(--brasa)]/60 bg-[var(--panel-2)]/40 py-4 pl-5 pr-4">
      <blockquote
        cite={url}
        className="text-base leading-relaxed text-[var(--papel)]"
      >
        {children}
      </blockquote>
      <figcaption className="mt-3 font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--brasa)]"
        >
          {fuente}
        </a>
      </figcaption>
    </figure>
  );
}

/** Lo que hay que retener de una sección. Uno por sección como mucho. */
export function Aparte({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <aside className="rounded-xl border border-[var(--brasa)]/25 bg-[var(--brasa)]/[0.07] p-5">
      <p className="font-mono text-rotulo uppercase tracking-wider text-[var(--brasa)]">
        {titulo}
      </p>
      <div className="mt-2 text-base leading-relaxed text-[var(--papel)]">
        {children}
      </div>
    </aside>
  );
}

/**
 * Una tabla.
 *
 * El contenedor scrollea solo: una tabla de cuatro columnas en un teléfono es la
 * forma más rápida de que la página entera se desborde a lo ancho, y quien lee
 * esto lo hace desde el celular tanto como desde un escritorio.
 */
export function Tabla({
  encabezados,
  filas,
}: {
  encabezados: string[];
  filas: ReactNode[][];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--linea-30)]">
            {encabezados.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-3 pr-4 font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr
              key={i}
              className="border-b border-dashed border-[var(--linea-16)] align-top"
            >
              {fila.map((celda, j) => (
                <td
                  key={j}
                  className={`py-3.5 pr-4 text-sm leading-relaxed ${
                    j === 0
                      ? "font-semibold text-[var(--papel)]"
                      : "text-[var(--linea)]"
                  }`}
                >
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Un enlace dentro del texto. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  const externo = href.startsWith("http");
  const clases =
    "font-medium text-[var(--papel)] underline decoration-[var(--brasa)] decoration-2 underline-offset-4 transition-colors hover:text-[var(--brasa)]";

  if (externo) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={clases}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={clases}>
      {children}
    </Link>
  );
}

/** Resalta una idea dentro de un párrafo. */
export function Fuerte({ children }: { children: ReactNode }) {
  return (
    <strong className="font-semibold text-[var(--papel)]">{children}</strong>
  );
}
