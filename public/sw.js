const STATIC_CACHE = "dtsc-static-v1";
const OFFLINE_URL = "/offline";

const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_FILE_PATTERN = /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?)$/i;
const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/dashboard",
  "/chat",
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

function isPrivateOrApiPath(pathname) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isStaticAsset(pathname) {
  return STATIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || STATIC_FILE_PATTERN.test(pathname);
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
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
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
