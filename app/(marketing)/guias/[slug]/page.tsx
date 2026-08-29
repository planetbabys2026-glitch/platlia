import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { Navbar } from "../../components/navbar";
import { Footer } from "../../components/footer";
import { ArticuloEstructurado } from "../../components/datos-estructurados";
import { GUIAS, guiaPorSlug } from "../guias";
import { CONTENIDOS, NOMBRE_RELACIONADA } from "../_contenidos";

/**
 * Una guía.
 *
 * `generateStaticParams` las deja prerenderizadas: son cinco páginas de texto
 * que no dependen de la base, así que no hay razón para que un rastreador espere
 * un render. `dynamicParams = false` hace que un slug inventado dé 404 en vez de
 * intentar construirse.
 *
 * En Next 15 `params` es una Promise y hay que esperarla. Los tipos globales
 * `PageProps<>` son de Next 16 y acá no existen: las props se tipan a mano.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIAS.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guia = guiaPorSlug(slug);
  if (!guia) return {};

  const url = `/guias/${guia.slug}`;

  return {
    title: guia.titulo,
    description: guia.descripcion,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: guia.titulo,
      description: guia.descripcion,
      url,
      publishedTime: guia.publicado,
      modifiedTime: guia.actualizado,
    },
    twitter: { title: guia.titulo, description: guia.descripcion },
  };
}

export default async function GuiaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guia = guiaPorSlug(slug);
  if (!guia) notFound();

  const Contenido = CONTENIDOS[guia.slug];
  if (!Contenido) notFound();

  // Las otras guías, para que ninguna sea un callejón sin salida. Mientras no
  // haya enlaces externos, los internos son los únicos que tiene el rastreador
  // para encontrar el resto del sitio.
  const otras = GUIAS.filter((g) => g.slug !== guia.slug).slice(0, 2);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <ArticuloEstructurado
        url={`${env.APP_URL}/guias/${guia.slug}`}
        titulo={guia.titulo}
        descripcion={guia.descripcion}
        publicado={guia.publicado}
        actualizado={guia.actualizado}
        seccion={{ nombre: "Guías", url: `${env.APP_URL}/guias` }}
      />

      <Navbar />

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-3 gap-2 text-muted-foreground hover:text-foreground"
          >
            <Link href="/guias">
              <ArrowLeft className="size-4" />
              Todas las guías
            </Link>
          </Button>

          <header className="mt-6 space-y-5 border-b border-dashed border-[var(--linea-30)] pb-8">
            <p className="font-mono text-rotulo uppercase tracking-[0.22em] text-[var(--brasa)]">
              Guía · Colombia
            </p>
            <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-tight text-[var(--papel)] sm:text-5xl">
              {guia.titulo}
            </h1>
            <p className="text-lg leading-relaxed text-[var(--linea)]">
              {guia.bajada}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {guia.lectura} min de lectura
              </span>
              <time dateTime={guia.actualizado}>
                Actualizada el {formatoLargo(guia.actualizado)}
              </time>
            </div>
          </header>

          <div className="mt-10 space-y-6">
            <Contenido />
          </div>

          {/* La conversión de una guía no es el mismo botón de la portada: quien
              llega acá vino a resolver una duda, no a comprar. El puente es la
              página del término que le corresponde. */}
          <section className="mt-14 rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-2)]/50 p-6 sm:p-8">
            <p className="font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
              Esto ya viene resuelto
            </p>
            <h2 className="mt-2 font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)]">
              {NOMBRE_RELACIONADA[guia.relacionada]}
            </h2>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="bg-[var(--brasa)] font-bold text-[var(--tinta)] hover:bg-[var(--brasa-hover)]"
              >
                <Link href={guia.relacionada} className="gap-1.5">
                  Ver cómo funciona
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-[var(--linea-30)] text-[var(--papel)] hover:bg-[var(--panel-2)]"
              >
                <Link href="/registro">Probar 7 días gratis</Link>
              </Button>
            </div>
          </section>

          {otras.length > 0 && (
            <nav className="mt-12 border-t border-dashed border-[var(--linea-30)] pt-8">
              <p className="font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
                Seguir leyendo
              </p>
              <ul className="mt-4 space-y-4">
                {otras.map((g) => (
                  <li key={g.slug}>
                    <Link href={`/guias/${g.slug}`} className="group block">
                      <span className="text-base font-semibold text-[var(--papel)] transition-colors group-hover:text-[var(--brasa)]">
                        {g.titulo}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                        {g.bajada}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </article>
      </main>

      <Footer />
    </div>
  );
}

/** "2026-08-29" → "29 de agosto de 2026". */
function formatoLargo(iso: string): string {
  // Se parte a mano en vez de `new Date(iso)`: esa cadena la interpreta como
  // medianoche UTC, que en Colombia son las 7 de la tarde del día anterior, y la
  // fecha mostrada quedaría un día atrás. Es el mismo defecto que ya costó una
  // vuelta con la ventana de las promociones.
  const [anio, mes, dia] = iso.split("-").map(Number);
  const MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}
