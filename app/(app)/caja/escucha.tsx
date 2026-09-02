"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene la caja al día sin que nadie recargue.
 *
 * Se suscribe al canal del negocio y refresca la pantalla cuando algo cambia:
 * entró una comanda, la mesa pidió la cuenta, la cocina terminó, otro cajero
 * cobró. Es el mismo patrón que el panel de domicilios.
 *
 * **Refresca con retardo, no en cada mensaje.** Mandar una comanda de seis platos
 * publica varias veces seguidas; sin agrupar, la pantalla se repinta seis veces y
 * el cajero ve la lista temblar. Se espera a que el ruido pare.
 *
 * **`router.refresh()` conserva el estado de los componentes cliente**, así que la
 * cuenta elegida y lo tecleado en el formulario de cobro sobreviven al refresco.
 * Eso es lo que hace que esto pueda estar siempre encendido sin interrumpir a
 * quien está cobrando; y por eso la cuenta elegida se guarda por `id` y no por
 * posición, porque la lista sí se reordena debajo.
 */
export function EscuchaDeCaja() {
  const router = useRouter();
  const [enVivo, setEnVivo] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fuente = new EventSource("/api/caja/stream");

    fuente.onopen = () => setEnVivo(true);

    fuente.onmessage = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => router.refresh(), 400);
    };

    fuente.onerror = () => {
      // `EventSource` reconecta solo mientras el estado sea CONNECTING; lo que no
      // vuelve es un CLOSED —el 401/403 del servidor—, y ahí decirlo es lo único
      // honesto: la pantalla queda vieja hasta que alguien recargue.
      if (fuente.readyState === EventSource.CLOSED) setEnVivo(false);
    };

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      fuente.close();
    };
  }, [router]);

  return (
    <span
      className="chip is-live"
      title={
        enVivo
          ? "La caja se actualiza sola: no hace falta recargar."
          : "Sin conexión en vivo: recargá para ver los cambios."
      }
    >
      {enVivo ? "EN VIVO" : "SIN CONEXIÓN"}
    </span>
  );
}
