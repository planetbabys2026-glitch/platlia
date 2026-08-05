"use client";

import { useEffect } from "react";

/**
 * Registra el service worker.
 *
 * El SW no cachea nada del negocio —ni pedidos, ni caja, ni informes—: en un
 * punto de venta servir un dato viejo por estar offline es peor que no tener
 * PWA. Lo único que resuelve es la instalabilidad y una pantalla propia en vez
 * del error del navegador cuando de verdad no hay señal.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin service worker la aplicación funciona igual: solo no se puede
      // instalar ni mostrar la pantalla de sin conexión.
    });
  }, []);

  return null;
}
