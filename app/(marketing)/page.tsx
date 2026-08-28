import { Navbar } from "./components/navbar";
import { Hero } from "./components/hero";
import { EfficiencyManifesto } from "./components/efficiency-manifesto";
import { Features } from "./components/features";
import type { Metadata } from "next";
import { preciosVigentes } from "@/lib/billing/lista";
import { formatCop } from "@/lib/money";
import { mensualDeLaLista } from "@/lib/billing/precios";
import { env } from "@/lib/env";
import { Pricing } from "./components/pricing";
import { ContactSection } from "./components/contact-section";
import { Faq } from "./components/faq";
import { DatosEstructurados } from "./components/datos-estructurados";
import { Footer } from "./components/footer";

/**
 * El título y la descripción de la portada llevan el PRECIO, y sale de la lista.
 *
 * Un resultado de búsqueda que dice "desde $69.900" recibe muchos más clics que
 * uno que no dice nada —quien busca software quiere saber si le alcanza antes de
 * entrar—, pero escribirlo a mano acá sería el mismo defecto que ya costó que el
 * hero prometiera $50.000 mientras el checkout cobraba $69.900. Con
 * `generateMetadata` se lee de la misma lista con la que se cobra.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { vigente } = await preciosVigentes();
  const desde = mensualDeLaLista(vigente, 1);
  const precio = desde === null ? "" : ` Desde ${formatCop(desde)} al mes.`;

  const descripcion =
    `Tomá el pedido en la mesa, mandalo a cocina y cobralo con factura electrónica DIAN. ` +
    `Menú QR, inventario e informes para bares y restaurantes en Colombia.${precio} ` +
    `7 días gratis, sin tarjeta.`;

  return {
    title: "Software y punto de venta para bares y restaurantes en Colombia",
    description: descripcion,
    alternates: { canonical: "/" },
    openGraph: { title: "Platlia — Software para bares y restaurantes", description: descripcion, url: "/" },
    twitter: { title: "Platlia — Software para bares y restaurantes", description: descripcion },
  };
}

export default async function LandingPage() {
  // El precio que se muestra sale de la misma lista con la que se cobra: si el
  // superadministrador lanza una promoción, la portada la refleja sola.
  const { vigente: lista, base, promo } = await preciosVigentes();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      {/* Lo que Google y los asistentes leen para saber qué es esto, con el
          precio tomado de la lista. */}
      <DatosEstructurados url={env.APP_URL} mensualCop={mensualDeLaLista(lista, 1)} />

      {/* Barra de navegación superior */}
      <Navbar />

      <main className="flex-1">
        {/* El precio viaja desde la lista: la portada no puede prometer una
            cifra distinta de la que cobra el checkout. */}
        <Hero desdeCop={mensualDeLaLista(lista, 1)} />

        {/* Manifiesto de impacto: Cada segundo optimizado = Comensales felices y mayor rentabilidad */}
        <EfficiencyManifesto />

        {/* Virtudes y Módulos del Sistema */}
        <Features />

        {/* Planes y precios, cotizados con la misma función que el checkout. */}
        <Pricing lista={lista} base={base} promo={promo} />

        {/* Las preguntas que frenan una venta, a la vista y en el marcado que
            leen Google y los asistentes. */}
        <Faq mensualCop={mensualDeLaLista(lista, 1)} />

        {/* Formulario de Contacto Comercial */}
        <ContactSection />
      </main>

      {/* Pie de página institucional */}
      <Footer />
    </div>
  );
}
