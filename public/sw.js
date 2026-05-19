const STATIC_CACHE = "dtsc-static-v3-20260519";
const OFFLINE_URL = "/offline.html";

const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_FILE_PATTERN = /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?)$/i;
const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/dashboard",
  "/chat",
  "/activities",
  "/collaborators",
  "/admin",
  "/profile",
  "/settings",
  "/support",
  "/notifications",
  "/announcements",
  "/billing",
  "/company",
  "/documents",
  "/session-expired",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192x192.png", "/icons/icon-512x512.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isPrivateOrApiPath(pathname) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isStaticAsset(pathname) {
  return STATIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || STATIC_FILE_PATTERN.test(pathname);
}

function offlineFallback() {
  return caches.match(OFFLINE_URL).then((cachedResponse) => {
    return cachedResponse || new Response(
      "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Hors ligne</title><body style=\"margin:0;display:grid;min-height:100vh;place-items:center;background:#071427;color:white;font-family:system-ui,sans-serif;padding:24px;text-align:center\"><main><h1>Vous êtes hors ligne.</h1><p>DTSC Platform nécessite une connexion pour charger cette page.</p></main></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (isPrivateOrApiPath(url.pathname)) {
    if (request.mode === "navigate") {
      event.respondWith(fetch(request).catch(() => offlineFallback()));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => offlineFallback()));
    return;
  }

  if (!isStaticAsset(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
