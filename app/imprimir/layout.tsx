import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Imprimir",
  // Un tiquete no tiene por qué aparecer en un buscador.
  robots: { index: false, follow: false },
};

/**
 * Marco de las rutas de impresión.
 *
 * Deliberadamente vacío: ni barra, ni navegación, ni fondo. Lo que se ve en
 * pantalla es exactamente lo que sale del rollo. El ancho de página lo fija cada
 * tiquete según el papel configurado en la empresa, porque 55 mm y 80 mm no son
 * el mismo documento.
 */
export default function ImprimirLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-white text-black">{children}</div>;
}
