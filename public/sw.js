// Service worker de Platlia.
//
// Resuelve dos cosas y nada más: que la aplicación se pueda instalar, y que sin
// señal aparezca una pantalla propia en vez del error del navegador. NO cachea
// nada del negocio —ni /salon, ni /cocina, ni una sola llamada a la API—: en un
// punto de venta, servir un dato viejo por estar offline (una mesa que ya se
// cobró, una caja que ya se cerró) es peor que mostrar que no hay señal.
//
// Por eso `fetch` solo actúa sobre navegaciones (`request.mode === "navigate"`)
// y solo cuando la red falla de verdad: mientras hay señal, todo pasa de largo
// sin tocar el service worker.

const CACHE = "platlia-shell-v1";
const RESPALDO = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([RESPALDO, "/icons/icon-512.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(RESPALDO)),
  );
});
