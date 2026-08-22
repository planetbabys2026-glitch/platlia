import { Navbar } from "./components/navbar";
import { Hero } from "./components/hero";
import { EfficiencyManifesto } from "./components/efficiency-manifesto";
import { Features } from "./components/features";
import { preciosVigentes } from "@/lib/billing/lista";
import { Pricing } from "./components/pricing";
import { ContactSection } from "./components/contact-section";
import { Footer } from "./components/footer";

export default async function LandingPage() {
  // El precio que se muestra sale de la misma lista con la que se cobra: si el
  // superadministrador lanza una promoción, la portada la refleja sola.
  const { vigente: lista, base, promo } = await preciosVigentes();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      {/* Barra de navegación superior */}
      <Navbar />

      <main className="flex-1">
        {/* Banner principal con propuesta de valor de optimización en vivo */}
        <Hero />

        {/* Manifiesto de impacto: Cada segundo optimizado = Comensales felices y mayor rentabilidad */}
        <EfficiencyManifesto />

        {/* Virtudes y Módulos del Sistema */}
        <Features />

        {/* Planes y Precios de Licencia ($50.000 COP/mes) */}
        <Pricing lista={lista} base={base} promo={promo} />

        {/* Formulario de Contacto Comercial */}
        <ContactSection />
      </main>

      {/* Pie de página institucional */}
      <Footer />
    </div>
  );
}
