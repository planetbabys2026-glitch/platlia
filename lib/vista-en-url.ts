"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * La pestaña activa de un módulo, guardada en la URL.
 *
 * Existe porque el menú lateral ahora despliega las secciones internas de cada
 * módulo —Caja, Informes, Inventario, Configuración— y un enlace no puede apuntar
 * a un `useState`. Con la vista en la URL, el mismo estado sirve para el menú,
 * para el atajo del navegador y para compartir un enlace a "la pestaña de
 * facturas" en lugar de "inventario, y después buscá vos".
 *
 * `replace` y no `push`: cambiar de pestaña dentro de un módulo no es navegar, y
 * llenar el historial obligaría a apretar "atrás" seis veces para salir de
 * Configuración. `scroll: false` porque el contenido cambia arriba de todo y
 * saltar al tope es desorientador cuando la pestaña ya se ve.
 */
export function useVistaEnUrl<T extends string>(
  clave: string,
  vistas: readonly T[],
  porDefecto: T,
): [T, (vista: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const crudo = searchParams.get(clave);
  const actual = vistas.includes(crudo as T) ? (crudo as T) : porDefecto;

  const cambiar = useCallback(
    (vista: T) => {
      const params = new URLSearchParams(searchParams.toString());
      // La vista por defecto no ensucia la URL: `/caja` y `/caja?vista=cobros`
      // son la misma pantalla y conviene que se escriban igual.
      if (vista === porDefecto) params.delete(clave);
      else params.set(clave, vista);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, clave, porDefecto],
  );

  return [actual, cambiar];
}
