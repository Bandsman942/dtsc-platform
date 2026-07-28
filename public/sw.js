const STATIC_CACHE = "dtsc-static-v8-20260728";
const OFFLINE_URL = "/offline.html";

const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_FILE_PATTERN = /\.(?:js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?)$/i;
const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/dashboard",
  "/chat",
  "/calendar",
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
      .then((cache) => cache.addAll([OFFLINE_URL, "/dtsc-logo.png", "/icons/icon-192x192.png", "/icons/icon-512x512.png", "/icons/notification-badge.png"]))
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

function normalizeNotificationTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/notifications";
  }
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) {
      return "/notifications";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/notifications";
  }
}

function normalizePushPayload(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.slice(0, 120) : "Nouvelle notification DTSC",
    body: typeof value.body === "string" && value.body.trim() ? value.body.slice(0, 180) : "Ouvrez DTSC Platform pour consulter les détails.",
    url: normalizeNotificationTarget(value.url),
    tag: typeof value.tag === "string" && value.tag.trim() ? value.tag.slice(0, 120) : `dtsc-${Date.now()}`,
  };
}

function offlineFallback() {
  return caches.match(OFFLINE_URL).then((cachedResponse) => {
    return cachedResponse || new Response(
      "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><title>Hors ligne</title><body style=\"margin:0;display:grid;min-height:100vh;min-height:100dvh;place-items:center;background:#071427;color:white;font-family:system-ui,sans-serif;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));text-align:center\"><main><h1>Vous êtes hors ligne.</h1><p>DTSC Platform nécessite une connexion pour charger cette page.</p></main></body></html>",
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
      const networkResponse = fetch(request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone));
        }
        return response;
      });

      if (cachedResponse) {
        event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined));
        return cachedResponse;
      }

      return networkResponse;
    })
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let rawPayload = null;
    try {
      rawPayload = event.data ? event.data.json() : null;
    } catch {
      try {
        const text = event.data ? event.data.text() : "";
        rawPayload = text ? { body: text } : null;
      } catch {
        rawPayload = null;
      }
    }

    const payload = normalizePushPayload(rawPayload);
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/dtsc-logo.png",
      badge: "/icons/notification-badge.png",
      tag: payload.tag,
      data: { url: payload.url },
    });

    if (self.navigator && typeof self.navigator.setAppBadge === "function") {
      await self.navigator.setAppBadge().catch(() => undefined);
    }

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: "DTSC_PUSH_RECEIVED" }));
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = normalizeNotificationTarget(event.notification.data?.url);
  const targetUrl = new URL(targetPath, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("navigate" in client && "focus" in client) {
          await client.navigate(targetUrl);
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
