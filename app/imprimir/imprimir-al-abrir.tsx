"use client";

import { useEffect } from "react";

/**
 * Manda a imprimir apenas la página termina de pintarse.
 *
 * La ruta se abre en una ventana nueva con el único fin de imprimir, así que
 * pedirle además un clic al cajero es una fricción sin sentido cuando tiene la
 * fila esperando. Igual queda el botón, para reimprimir sin recargar.
 */
export function ImprimirAlAbrir() {
  useEffect(() => {
    // Un cuadro doble ocurre si el efecto se re-ejecuta; el flag lo evita en el
    // modo estricto de desarrollo.
    let cancelado = false;
    const id = window.setTimeout(() => {
      if (!cancelado) window.print();
    }, 150);

    return () => {
      cancelado = true;
      window.clearTimeout(id);
    };
  }, []);

  return null;
}

export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-imprimir mx-auto my-4 block rounded-lg border border-neutral-400 px-4 py-2 text-sm"
    >
      Imprimir de nuevo
    </button>
  );
}
