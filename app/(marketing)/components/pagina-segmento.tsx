import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { Pricing } from "./pricing";
import { Faq } from "./faq";
import type { ListaDePrecios } from "@/lib/billing/precios";
import { GUIAS } from "../guias/guias";

/**
 * El molde de una página de segmento: una por término de búsqueda.
 *
 * **Por qué existen dos páginas y no una.** La portada trata "bares" y
 * "restaurantes" como lo mismo, y por eso no gana ninguno de los dos términos:
 * un `<h1>` que dice las dos cosas es más débil, para cualquiera de las dos
 * búsquedas, que uno que dice una sola. Cada página de acá se queda con su
 * término entero en el `<h1>`, el `<title>`, la canónica y el primer párrafo.
 *
 * **Y por qué son distintas por dentro, no la misma con las palabras cambiadas.**
 * Dos páginas que dicen lo mismo con sinónimos son exactamente lo que Google
 * llama contenido de puerta de entrada, y se penaliza. Lo que las separa es
 * verdad del producto: un bar necesita que la jornada no corte a medianoche; un
 * restaurante necesita costeo por receta. Si el contenido no fuera de verdad
 * distinto, correspondería una sola página.
 */

export type BloqueSegmento = {
  titulo: string;
  cuerpo: ReactNode;
};

export type CapacidadSegmento = {
  titulo: string;
  detalle: string;
};

export function PaginaSegmento({
  eyebrow,
  titulo,
  bajada,
  problema,
  capacidades,
  bloques,
  guiasDestacadas,
  lista,
  base,
  promo,
  mensualCop,
}: {
  eyebrow: string;
  /** Lleva el término de búsqueda entero. Es el `<h1>`. */
  titulo: ReactNode;
  bajada: string;
  /** El dolor concreto de este segmento, en dos o tres frases. */
  problema: { titulo: string; cuerpo: ReactNode };
  capacidades: CapacidadSegmento[];
  bloques: BloqueSegmento[];
  /** Slugs de las guías que le corresponden a este segmento. */
  guiasDestacadas: string[];
  lista: ListaDePrecios;
  base: ListaDePrecios;
  promo: ListaDePrecios | null;
  mensualCop: number | null;
}) {
  const guias = GUIAS.filter((g) => guiasDestacadas.includes(g.slug));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <Navbar />

      <main className="flex-1">
        {/* Encabezado: el término, y qué hace el producto por él. */}
        <section className="border-b border-dashed border-[var(--linea-30)]">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
            <p className="font-mono text-rotulo uppercase tracking-[0.22em] text-[var(--brasa)]">
              {eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl font-display text-4xl font-black uppercase leading-[0.95] tracking-tight text-[var(--papel)] sm:text-5xl lg:text-6xl">
              {titulo}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--linea)]">
              {bajada}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="bg-[var(--brasa)] font-bold text-[var(--tinta)] hover:bg-[var(--brasa-hover)]"
              >
                <Link href="/registro" className="gap-2">
                  <Sparkles className="size-4" />
                  Probar 7 días gratis
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[var(--linea-30)] text-[var(--papel)] hover:bg-[var(--panel-2)]"
              >
                <Link href="#precios">Ver precios</Link>
              </Button>
            </div>

            <p className="mt-5 font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
              Sin tarjeta · Mesas y meseros sin límite · Cancelás cuando quieras
            </p>
          </div>
        </section>

        {/* El problema. Va antes que las funciones: quien busca esto ya tiene el
            problema y no está buscando una lista de características. */}
        <section className="border-b border-dashed border-[var(--linea-16)] bg-[var(--panel-2)]/30">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)] sm:text-3xl">
              {problema.titulo}
            </h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-[var(--linea)]">
              {problema.cuerpo}
            </div>
          </div>
        </section>

        {/* Lo que hace. */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)] sm:text-3xl">
            Lo que resuelve
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
            {capacidades.map((c) => (
              <li key={c.titulo} className="flex gap-3.5">
                <Check className="mt-0.5 size-5 shrink-0 text-[var(--brasa)]" />
                <div>
                  <h3 className="text-base font-semibold text-[var(--papel)]">
                    {c.titulo}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {c.detalle}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Los bloques largos: lo que de verdad diferencia a este segmento. */}
        <section className="border-y border-dashed border-[var(--linea-16)]">
          <div className="mx-auto max-w-3xl space-y-12 px-4 py-16 sm:px-6">
            {bloques.map((b) => (
              <div key={b.titulo}>
                <h2 className="font-display text-2xl font-black uppercase leading-tight tracking-tight text-[var(--papel)] sm:text-3xl">
                  {b.titulo}
                </h2>
                <div className="mt-4 space-y-4 text-base leading-relaxed text-[var(--linea)]">
                  {b.cuerpo}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Precios: la misma calculadora de la portada, con la misma lista con la
            que cobra el checkout. Nunca un precio escrito a mano. */}
        <Pricing lista={lista} base={base} promo={promo} />

        {/* Las guías. Son el otro motivo por el que alguien llega hasta acá. */}
        {guias.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)] sm:text-3xl">
              Para leer antes de decidir
            </h2>
            <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {guias.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guias/${g.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-2)]/40 p-6 transition-colors hover:border-[var(--brasa)]/40"
                  >
                    <span className="font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
                      {g.lectura} min
                    </span>
                    <span className="mt-3 text-base font-semibold leading-snug text-[var(--papel)] transition-colors group-hover:text-[var(--brasa)]">
                      {g.titulo}
                    </span>
                    <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {g.bajada}
                    </span>
                    <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-rotulo uppercase tracking-wider text-[var(--brasa)]">
                      Leer
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Faq mensualCop={mensualCop} />
      </main>

      <Footer />
    </div>
  );
}
