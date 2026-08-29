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
 * Se regenera cada 5 minutos, y hace falta.
 *
 * Esta página lee el precio de la lista, pero una consulta a la base NO alcanza
 * para que Next la considere dinámica —solo lo hacen las APIs dinámicas como
 * `cookies()` o `searchParams`—, así que quedaba prerenderizada en el build con
 * el precio horneado en el HTML. Verificado: el `$69.900` estaba escrito dentro
 * de `.next/server/app/*.html`.
 *
 * O sea que la promesa de que una promoción se refleja sola era falsa: hacía
 * falta volver a desplegar. Y detener una promoción es urgente por definición
 * —existe una acción aparte justamente para eso—, así que la ventana no puede
 * ser de una hora.
 *
 * 5 minutos y no `force-dynamic`: la página sigue sirviéndose desde caché, que
 * es lo que le conviene a un rastreador y a alguien que la abre con datos
 * flojos, y el precio nunca puede estar más de 5 minutos desactualizado.
 */
export const revalidate = 300;

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
