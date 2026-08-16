import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lo que se ve mientras el servidor arma una pantalla.
 *
 * Existe porque el `loading.tsx` de la aplicación no dibujaba nada: usaba
 * `PantallaCargando`, que decide mostrarse con `useFormStatus()` —y en un
 * `loading.tsx` no hay formulario— así que devolvía `null`. El resultado era que
 * cada navegación a una pantalla `force-dynamic` dejaba el `<main>` en blanco,
 * sin una sola señal de que algo estuviera pasando.
 *
 * Es un esqueleto y no un velo con animación a propósito: en un turno se navega
 * entre salón, caja y cocina todo el tiempo, y tapar la pantalla en cada salto
 * cansa y esconde la barra de navegación. Un esqueleto ocupa el lugar que va a
 * ocupar el contenido, así que nada salta cuando llega.
 */
/**
 * El `bg-muted` que trae `Skeleton` por defecto es el token del texto apagado
 * —el beige de la paleta— y sobre el fondo oscuro sale casi blanco: la pantalla
 * de carga gritaba más que el contenido. Acá se usan las superficies de panel,
 * que es lo que ocupa ese lugar cuando llega lo de verdad.
 */
const BLOQUE = "bg-[var(--panel-2)]";

export function EsqueletoPantalla() {
  return (
    <div className="space-y-8" role="status" aria-label="Cargando la pantalla">
      {/* Encabezado: título, bajada y el chip que casi todas llevan a la derecha. */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div className="space-y-2.5">
          <Skeleton className={`h-9 w-56 sm:h-10 sm:w-72 ${BLOQUE}`} />
          <Skeleton className={`h-3.5 w-64 sm:w-96 ${BLOQUE}`} />
        </div>
        <Skeleton className={`h-7 w-28 rounded-full ${BLOQUE}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className={`h-28 rounded-2xl ${BLOQUE}`} />
        ))}
      </div>
    </div>
  );
}
