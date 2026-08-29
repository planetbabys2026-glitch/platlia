/**
 * Las páginas públicas de la marca, con la fecha real de su última edición.
 *
 * **La fecha se escribe a mano, y esa es la idea.** Antes `app/sitemap.ts` hacía
 * `new Date()` al construir la respuesta, así que las cinco URLs declaraban
 * "modificada ahora mismo" en cada petición. Google descarta los `lastmod` que
 * detecta poco fiables, y un sitemap donde todo cambió hace un segundo es
 * exactamente el caso que describe su documentación: el dato deja de servir para
 * lo único que sirve, que es avisar qué vale la pena volver a rastrear.
 *
 * Es el mismo criterio que el resto del proyecto aplica a las fechas: nada de
 * valores que se generan solos y no significan nada.
 *
 * Al editar una de estas páginas hay que mover su fecha acá. Si se olvida, lo
 * peor que pasa es que Google tarde más en volver; al revés —mentir que cambió—
 * es lo que hace que deje de creernos.
 */
export type RutaPublica = {
  ruta: string;
  /** `YYYY-MM-DD` de la última edición de contenido. */
  actualizado: string;
  prioridad: number;
  frecuencia: "weekly" | "monthly" | "yearly";
};

export const RUTAS_PUBLICAS: readonly RutaPublica[] = [
  { ruta: "/", actualizado: "2026-08-29", prioridad: 1, frecuencia: "weekly" },
  {
    ruta: "/software-para-restaurantes",
    actualizado: "2026-08-29",
    prioridad: 0.9,
    frecuencia: "monthly",
  },
  {
    ruta: "/software-para-bares",
    actualizado: "2026-08-29",
    prioridad: 0.9,
    frecuencia: "monthly",
  },
  {
    ruta: "/precios",
    actualizado: "2026-08-29",
    prioridad: 0.9,
    frecuencia: "monthly",
  },
  {
    ruta: "/guias",
    actualizado: "2026-08-29",
    prioridad: 0.6,
    frecuencia: "monthly",
  },
  {
    ruta: "/registro",
    actualizado: "2026-08-06",
    prioridad: 0.8,
    frecuencia: "monthly",
  },
  {
    ruta: "/ingresar",
    actualizado: "2026-08-06",
    prioridad: 0.3,
    frecuencia: "yearly",
  },
  {
    ruta: "/pqr",
    actualizado: "2026-08-12",
    prioridad: 0.2,
    frecuencia: "yearly",
  },
  {
    ruta: "/habeas-data",
    actualizado: "2026-08-12",
    prioridad: 0.2,
    frecuencia: "yearly",
  },
];
