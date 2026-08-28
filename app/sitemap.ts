import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Las páginas públicas, para que un buscador sepa que existen.
 *
 * Solo las de la marca. **Las cartas QR de los clientes (`/m/[slug]`) no van
 * acá a propósito**: un negocio activa su menú para que sus comensales lo abran
 * escaneando la mesa, no para aparecer en Google. Publicar su carta y sus
 * precios en un índice sin habérselo preguntado es una decisión que le
 * corresponde a él, no a nosotros. El día que se ofrezca, va con una casilla en
 * Configuración y entra en este listado.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();

  return [
    { url: `${env.APP_URL}/`, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
    { url: `${env.APP_URL}/registro`, lastModified: ahora, changeFrequency: "monthly", priority: 0.9 },
    { url: `${env.APP_URL}/ingresar`, lastModified: ahora, changeFrequency: "yearly", priority: 0.3 },
    { url: `${env.APP_URL}/pqr`, lastModified: ahora, changeFrequency: "yearly", priority: 0.2 },
    { url: `${env.APP_URL}/habeas-data`, lastModified: ahora, changeFrequency: "yearly", priority: 0.2 },
  ];
}
