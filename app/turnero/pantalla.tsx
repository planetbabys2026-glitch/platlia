"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * El televisor se refresca solo.
 *
 * Diez segundos: el turnero es lo único que mira el cliente parado esperando su
 * pedido, y quince ya se sienten largos. No es un stream por la misma razón que
 * la cocina: la reconexión, el latido y el proxy que bufferea son piezas que se
 * justifican cuando esto lo miren muchos negocios a la vez, no antes.
 */
export function RefrescoDeTelevisor({ segundos = 10 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);

  return null;
}

/**
 * Mantiene la pantalla encendida.
 *
 * Un televisor o una tablet colgada en la pared se apaga sola a los pocos
 * minutos y el turnero deja de servir justo cuando hay gente esperando. La API
 * puede no existir o ser rechazada; si falla, no pasa nada.
 */
export function PantallaSiempreEncendida() {
  useEffect(() => {
    let centinela: WakeLockSentinel | null = null;
    let cancelado = false;

    const pedir = async () => {
      try {
        centinela = await navigator.wakeLock?.request("screen");
      } catch {
        // Sin permiso o sin soporte: el turnero funciona igual.
      }
    };

    void pedir();

    // El bloqueo se pierde al minimizar o cambiar de pestaña: se vuelve a pedir.
    const alVolver = () => {
      if (!cancelado && document.visibilityState === "visible") void pedir();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alVolver);
      void centinela?.release();
    };
  }, []);

  return null;
}
