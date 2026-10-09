const CACHE_NAME = "sismo-panama-v3";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/leaflet.js",
  "/siren.wav",
  "/fonts/dm-sans-latin.woff2",
  "/fonts/space-grotesk-latin.woff2",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Lo que no es de este dominio (mosaicos del mapa de Google/Esri) lo carga el navegador directamente:
  // si el service worker lo reenviara con fetch(), la CSP (connect-src 'self') lo bloquearía.
  if (url.origin !== self.location.origin) {
    return;
  }
  // Las peticiones a las APIs de sismos siempre van a la red sin caché
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (event.request.method !== "GET") {
    return;
  }
  // Para navegación HTML, usar Network-First: carga la versión más reciente si hay conexión,
  // y cae al caché solo si el usuario está offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    }),
  );
});
