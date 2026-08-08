import { Navbar } from "./components/navbar";
import { Hero } from "./components/hero";
import { EfficiencyManifesto } from "./components/efficiency-manifesto";
import { Features } from "./components/features";
import { Pricing } from "./components/pricing";
import { ContactSection } from "./components/contact-section";
import { Footer } from "./components/footer";

export default function LandingPage() {
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
        <Pricing />

        {/* Formulario de Contacto Comercial */}
        <ContactSection />
      </main>

      {/* Pie de página institucional */}
      <Footer />
    </div>
  );
}
