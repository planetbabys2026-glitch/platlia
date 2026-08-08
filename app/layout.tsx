import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Inter, Space_Mono } from "next/font/google";
import { RegistroServiceWorker } from "@/components/pwa/registro-sw";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter para la interfaz operativa y paneles táctiles
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Big Shoulders para números gigantes de mesa, títulos de comanda y cabeceras
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
      className={`dark ${inter.variable} ${bigShoulders.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors closeButton position="top-right" />
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
