import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import { RegistroServiceWorker } from "@/components/pwa/registro-sw";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

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

// Space Mono para precios en COP, tiempos de cocina y códigos de comanda térmica
const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Platlia — Gestión para bares y restaurantes",
    template: "%s · Platlia",
  },
  description:
    "Administrá tu restaurante o bar: mesas, pedidos, caja, cocina e informes en un solo lugar.",
  applicationName: "Platlia",
  appleWebApp: { capable: true, title: "Platlia", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
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
      className={`dark ${generalSans.variable} ${bigShoulders.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors closeButton position="top-right" />
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
