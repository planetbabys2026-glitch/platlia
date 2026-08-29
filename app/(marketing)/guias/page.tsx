import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { Navbar } from "../components/navbar";
import { Footer } from "../components/footer";
import { GUIAS } from "./guias";

export const metadata: Metadata = {
  title: "Guías para bares y restaurantes en Colombia",
  description:
    "Impuesto al consumo, facturación DIAN, propina según la Ley 1935, cierre de caja y costo por plato. Escritas desde la operación de un restaurante.",
  alternates: { canonical: "/guias" },
  openGraph: {
    title: "Guías para bares y restaurantes en Colombia",
    description:
      "Impuestos, facturación DIAN, propina, arqueo de caja y costeo. Escritas desde la operación real de un restaurante colombiano.",
    url: "/guias",
  },
};

export default function GuiasPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-20">
          <header className="space-y-5 border-b border-dashed border-[var(--linea-30)] pb-10">
            <p className="font-mono text-rotulo uppercase tracking-[0.22em] text-[var(--brasa)]">
              Guías · Colombia
            </p>
            <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-tight text-[var(--papel)] sm:text-5xl">
              Lo que hay que saber
              <br />
              antes de que te pase
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[var(--linea)]">
              Impuestos, facturación electrónica, propina, arqueo y costeo.
              Están escritas desde el problema, con el texto de la ley cuando
              hay ley y con la aritmética cuando hay aritmética.
            </p>
          </header>

          <ul className="mt-4 divide-y divide-dashed divide-[var(--linea-16)]">
            {GUIAS.map((guia) => (
              <li key={guia.slug}>
                <Link
                  href={`/guias/${guia.slug}`}
                  className="group flex flex-col gap-3 py-8 transition-opacity hover:opacity-95"
                >
                  <span className="inline-flex items-center gap-2 font-mono text-rotulo uppercase tracking-wider text-[var(--linea-55)]">
                    <Clock className="size-3.5" />
                    {guia.lectura} min
                  </span>
                  <h2 className="font-display text-2xl font-black uppercase leading-tight tracking-tight text-[var(--papel)] transition-colors group-hover:text-[var(--brasa)] sm:text-3xl">
                    {guia.titulo}
                  </h2>
                  <p className="max-w-2xl text-base leading-relaxed text-[var(--linea)]">
                    {guia.bajada}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-rotulo uppercase tracking-wider text-[var(--brasa)]">
                    Leer
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <Footer />
    </div>
  );
}
