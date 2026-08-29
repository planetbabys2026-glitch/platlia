import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { RegistroServiceWorker } from "@/components/pwa/registro-sw";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { env } from "@/lib/env";

/**
 * General Sans para la interfaz operativa y los paneles táctiles.
 *
 * Es la que pide el manual, y no está en Google Fonts sino en Fontshare, así que
 * los `.woff2` viven en el repo y se sirven desde el propio dominio: sin pedido a
 * un tercero, que es lo que corresponde en el VPS y lo único que funciona cuando
 * la PWA arranca sin red.
 */
const generalSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/GeneralSans-700.woff2", weight: "700", style: "normal" },
  ],
});

// Big Shoulders para números gigantes de mesa, títulos de comanda y cabeceras.
// El manual la nombra "Big Shoulders Display", que es como se llamaba en Google
// Fonts hasta que absorbieron la superfamilia: hoy esa misma letra se pide como
// `Big_Shoulders` y no existe un `Big_Shoulders_Display` que importar.
const bigShoulders = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["700", "800", "900"],
  adjustFontFallback: false,
});

/**
 * Space Grotesk para precios en COP, tiempos de cocina y sellos.
 *
 * Es la hermana proporcional de Space Mono —mismo diseñador, mismo esqueleto—,
 * así que el sistema no cambia de familia: cambia de ancho. Space Mono reparte
 * el mismo avance a la "1" que a la "0", y en una carta llena de precios eso deja
 * huecos que se leen como errores de maquetado.
 *
 * **A cambio hay que pedir las cifras tabulares a mano.** Medido en el navegador
 * a 20px: sin `tabular-nums`, "111" mide 25.09px y "000" mide 38.47px —trece
 * píxeles de diferencia, o sea una columna de dinero con el borde derecho en
 * serrucho—; con `tabular-nums` las tres miden 37.20px. Por eso `globals.css` se
 * lo pone a la utilidad `font-mono` entera y no solo a `.numeral`: si dependiera
 * de acordarse en cada renglón, el día que alguien lo olvide la cuenta se
 * desalinea y nada falla.
 *
 * Los pesos son los cuatro que el código usa de verdad. Space Mono solo traía 400
 * y 700, así que hasta acá el `font-medium` y el `font-semibold` de las pantallas
 * los sintetizaba el navegador.
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  /**
   * Sin `metadataBase`, Next resuelve las imágenes de `openGraph` contra
   * `localhost` y el enlace compartido llega sin miniatura. En Colombia el canal
   * es WhatsApp: un enlace sin imagen ni descripción se ve como spam y no se
   * abre, así que esto vale más que cualquier palabra clave.
   */
  metadataBase: new URL(env.APP_URL),
  alternates: { canonical: "/" },
  title: {
    // El título es lo que se lee en el resultado de búsqueda: dice qué es y
    // para quién, no el nombre solo. "Software" y "punto de venta" están
    // porque son las palabras con las que la gente busca esto.
    default:
      "Platlia — Software y punto de venta para bares y restaurantes en Colombia",
    template: "%s · Platlia",
  },
  description:
    "Sistema para bares y restaurantes: toma de pedidos en mesa, pantalla de cocina, caja, menú QR, inventario y factura electrónica DIAN. 7 días gratis, sin tarjeta.",
  keywords: [
    "software para restaurantes",
    "punto de venta restaurante Colombia",
    "POS para bares",
    "comanda digital",
    "menú QR restaurante",
    "factura electrónica DIAN restaurante",
    "software para bares Colombia",
    "sistema de pedidos para restaurante",
  ],
  applicationName: "Platlia",
  category: "business",
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Platlia",
    title: "Platlia — Software y punto de venta para bares y restaurantes",
    description:
      "Tomá el pedido, mandalo a cocina y cobralo facturado. Menú QR, inventario e informes. 7 días gratis y sin tarjeta.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Platlia — Software para bares y restaurantes",
    description:
      "Salón, cocina, caja y factura electrónica DIAN en un solo sistema. 7 días gratis, sin tarjeta.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  /**
   * La verificación de propiedad, anclada en el código.
   *
   * Search Console y Bing aceptan varios métodos; el de DNS TXT se pierde el día
   * que el dominio cambia de proveedor, y la verificación se cae sin avisar —lo
   * único que se ve es que los informes dejan de actualizarse—. Con la meta acá,
   * mientras el sitio se despliegue sigue verificado.
   *
   * Los códigos son opcionales: sin ellos Next simplemente no emite la etiqueta.
   */
  verification: {
    google: env.GOOGLE_SITE_VERIFICATION,
    other: env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": env.BING_SITE_VERIFICATION }
      : {},
  },
  appleWebApp: { capable: true, title: "Platlia", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171512",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`dark ${generalSans.variable} ${bigShoulders.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors closeButton position="top-right" />
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
