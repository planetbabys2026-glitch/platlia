import { Navbar } from "./components/navbar";
import { Hero } from "./components/hero";
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
        {/* Banner principal e interfaz interactiva en vivo */}
        <Hero />

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
