const CACHE_NAME = "sismo-panama-v8";
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
    (async () => {
      const keys = await caches.keys();
      // Hay un caché de otra versión solo si esto es una actualización (no la primera instalación).
      const upgraded = keys.some((key) => key !== CACHE_NAME);
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
      if (upgraded) {
        // Una pestaña o ventana abierta antes de esta versión sigue ejecutando el código viejo (otra voz, otra lógica de
        // alertas) y alertaría por su cuenta, además de la nueva: se oyen dos alertas, a veces con voces distintas.
        // Se recargan para que todas usen la misma versión.
        const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        await Promise.all(open.map((client) => (client.navigate ? client.navigate(client.url).catch(() => {}) : null)));
      }
    })(),
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

// Receptor de Web Push (funciona incluso con la app cerrada / celular bloqueado)
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "🚨 Alerta Sísmica - Panamá";
  const options = {
    body: data.body || "Se ha registrado un evento sísmico reciente en Panamá.",
    icon: "/icon-192.png",
    badge: "/favicon.svg",
    vibrate: [400, 150, 400, 150, 400],
    tag: data.id ? `sismo-${data.id}` : "sismo-panama-alert",
    renotify: true,
    // Con sonido del sistema. Una notificación web no puede reproducir la sirena propia: eso solo lo hace la
    // página cuando está abierta.
    silent: false,
    requireInteraction: true,
    data: {
      url: data.url || "/",
      id: data.id,
      timestamp: data.time || Date.now(),
    },
    actions: [
      { action: "explore", title: "Ver Mapa" },
      { action: "close", title: "Cerrar" },
    ],
  };

  event.waitUntil(
    (async () => {
      // Un service worker no puede reproducir audio. Si la app está abierta (aunque sea en segundo plano) se le
      // avisa en el acto para que haga sonar la sirena y la voz, en vez de esperar a su próxima consulta.
      try {
        const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of open) {
          client.postMessage({
            type: "quake-push",
            quake: { id: data.id, magnitude: data.magnitude, place: data.place, time: data.time, lat: data.lat, lng: data.lng, depth: data.depth },
          });
        }
      } catch {
        // Sin ventanas abiertas no hay a quién avisar.
      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Android e iPhone renuevan de vez en cuando el "buzón" push del navegador. Si el servidor se queda con el
// anterior, el aviso se envía a un destino que ya no existe y el celular deja de recibir alertas sin que
// nadie lo note. Aquí se crea la suscripción nueva y se le dice al servidor, que traspasa el umbral.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription;
        let sub = event.newSubscription;
        if (!sub) {
          let key = old && old.options && old.options.applicationServerKey;
          if (!key) {
            const res = await fetch("/api/push/vapid-public-key");
            const { publicKey } = await res.json();
            key = urlBase64ToUint8Array(publicKey);
          }
          sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, oldEndpoint: old ? old.endpoint : undefined }),
        });
      } catch {
        // Sin red o sin permiso: la página lo reintenta al abrirse (syncPushSubscription).
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") {
    return;
  }
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && "focus" in client) {
          if ("navigate" in client && urlToOpen !== "/") {
            client.navigate(urlToOpen);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    }),
  );
});
