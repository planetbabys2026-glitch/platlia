import type { Metadata, Viewport } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter para toda la interfaz: es la que mejor aguanta pantallas densas y
// tiene cifras tabulares de verdad, que en este producto se usan en todas partes.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Archivo para títulos y cifras grandes. Es una grotesca más ancha e industrial
// que Inter, así que el número de mesa y el turno se leen a dos metros —que es
// exactamente como se usan, en la pantalla de cocina y en el televisor del salón—
// sin que la interfaz cambie de voz.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// Monoespaciada para tiquetes térmicos y códigos: el recibo se compone a 32 o 48
// caracteres por línea, así que la métrica fija no es estética, es funcional.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
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
};

// En Next 15 themeColor va en el export `viewport`, no dentro de `metadata`.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101416" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
