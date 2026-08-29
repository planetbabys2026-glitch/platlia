import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { preciosVigentes } from "@/lib/billing/lista";
import { mensualDeLaLista } from "@/lib/billing/precios";
import { formatCop } from "@/lib/money";
import { enlaceWhatsapp } from "@/lib/soporte";
import { Navbar } from "../components/navbar";
import { Footer } from "../components/footer";
import { Pricing } from "../components/pricing";
import { Faq } from "../components/faq";

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
 * La página de precios.
 *
 * Hasta acá el precio solo existía como una sección de la portada (`/#precios`),
 * así que "software para restaurantes precio" y "cuánto cuesta un POS para
 * restaurante" —dos de las búsquedas con más intención de compra que hay— no
 * tenían dónde aterrizar.
 *
 * **Todo lo que dice un número sale de la lista**, con las mismas funciones que
 * usa el checkout. Escribir una cifra a mano acá es exactamente el defecto que ya
 * hizo que la pantalla de licencia anunciara "$270.000 semestral con 10% de
 * descuento" mientras el sistema cobraba $250.000.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { vigente } = await preciosVigentes();
  const desde = mensualDeLaLista(vigente, 1);
  const precio =
    desde === null ? "" : `Desde ${formatCop(desde)} al mes por local. `;

  const descripcion =
    `${precio}Sin límite de mesas, meseros ni pantallas. Pagando 6 meses te regalamos ` +
    `1 y pagando 12, dos. 7 días gratis, sin tarjeta y sin permanencia.`;

  return {
    title: "Precios",
    description: descripcion,
    alternates: { canonical: "/precios" },
    openGraph: {
      title: "Precios de Platlia · Software para bares y restaurantes",
      description: descripcion,
      url: "/precios",
    },
    twitter: { title: "Precios de Platlia", description: descripcion },
  };
}

/** Lo que entra en la licencia y lo que no. Que no entra es lo que hay que decir. */
const INCLUIDO = [
  "Mesas, meseros y pantallas sin límite",
  "Pedidos en mesa y en mostrador",
  "Pantalla de cocina con tiempos por plato",
  "Menú QR con autopedido y tus colores",
  "Domicilios con seguimiento para el cliente",
  "Caja con arqueo y cierre de turno",
  "Inventario con receta y costo por plato",
  "Informes por día, semana, mes y año",
  "Impresión térmica de comandas y recibos",
  "Conexión con asistentes de IA",
  "Actualizaciones y soporte",
];

const APARTE = [
  {
    que: "Las facturas electrónicas de la DIAN",
    porque:
      "Se compran por paquete, según cuántas emitas al año. Empezás con uno chico y sumás cuando se acabe, en vez de pagar un plan anual de miles que no vas a usar. La conexión con la DIAN sí está incluida: no contratás ni configurás un proveedor.",
  },
  {
    que: "La impresora térmica",
    porque:
      "Sirve cualquiera de 58 u 80 mm que ya tengas, o una común del mercado. No vendemos equipos ni te obligamos a una marca.",
  },
];

export default async function PreciosPage() {
  const { vigente: lista, base, promo } = await preciosVigentes();
  const mensual = mensualDeLaLista(lista, 1);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <Navbar />

      <main className="flex-1">
        <section className="border-b border-dashed border-[var(--linea-30)]">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="font-mono text-rotulo uppercase tracking-[0.22em] text-[var(--brasa)]">
              Precios · Colombia
            </p>
            <h1 className="mt-5 font-display text-4xl font-black uppercase leading-[0.95] tracking-tight text-[var(--papel)] sm:text-5xl lg:text-6xl">
              Una licencia por local.
              <br />
              <span className="text-[var(--brasa)]">Sin letra chica</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--linea)]">
              {mensual === null
                ? "Se cobra por local, al mes, en pesos colombianos."
                : `${formatCop(mensual)} al mes por local, sin límite de mesas, meseros ni pantallas.`}{" "}
              Pagando seis meses te regalamos uno y pagando doce te regalamos
              dos. Se cancela cuando quieras y lo que ya pagaste lo usás hasta
              el final del período.
            </p>
          </div>
        </section>

        <Pricing lista={lista} base={base} promo={promo} />

        <section className="border-y border-dashed border-[var(--linea-16)]">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)]">
                Qué incluye
              </h2>
              <ul className="mt-6 space-y-3">
                {INCLUIDO.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-base leading-relaxed text-[var(--linea)]"
                  >
                    <Check className="mt-0.5 size-5 shrink-0 text-[var(--brasa)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)]">
                Qué va aparte
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Preferimos decirlo acá y no en la primera factura.
              </p>
              <ul className="mt-6 space-y-6">
                {APARTE.map((item) => (
                  <li key={item.que} className="flex gap-3">
                    <Minus className="mt-0.5 size-5 shrink-0 text-[var(--linea-55)]" />
                    <div>
                      <h3 className="text-base font-semibold text-[var(--papel)]">
                        {item.que}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {item.porque}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-2xl font-black uppercase tracking-tight text-[var(--papel)] sm:text-3xl">
            ¿Tres locales o más?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--linea)]">
            De tres sedes en adelante manejamos tarifa de cadena, que no es la
            suma de las licencias sueltas. Escribinos y la coordinamos.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              className="bg-[var(--brasa)] font-bold text-[var(--tinta)] hover:bg-[var(--brasa-hover)]"
            >
              <a
                href={enlaceWhatsapp(
                  "Hola, tengo varios locales y quiero saber la tarifa de cadena de Platlia.",
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Hablar por WhatsApp
              </a>
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

        <Faq mensualCop={mensual} />
      </main>

      <Footer />
    </div>
  );
}
