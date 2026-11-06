"use client";

import { useEffect } from "react";

const SW_UPDATE_MIN_INTERVAL_MS = 60_000;

export function PWARegister({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    if (!enabled) {
      navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => undefined);
      if ("caches" in window) caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("dtsc-")).map((key) => caches.delete(key)))).catch(() => undefined);
      return;
    }

    let disposed = false;
    let intervalId: number | undefined;
    let lastUpdateAt = 0;
    let updateInFlight = false;
    const cleanupCallbacks: Array<() => void> = [];

    function activateWaitingWorker(registration: ServiceWorkerRegistration) {
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    function requestUpdate(registration: ServiceWorkerRegistration) {
      const now = Date.now();
      if (disposed || !navigator.onLine || updateInFlight || now - lastUpdateAt < SW_UPDATE_MIN_INTERVAL_MS) return;
      lastUpdateAt = now;
      updateInFlight = true;
      void registration.update()
        .then(() => { if (!disposed) activateWaitingWorker(registration); })
        .catch(() => undefined)
        .finally(() => { updateInFlight = false; });
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (disposed) return;
      activateWaitingWorker(registration);
      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) activateWaitingWorker(registration);
        });
      });
      const updateOnOnline = () => requestUpdate(registration);
      const updateOnFocus = () => requestUpdate(registration);
      const updateOnVisible = () => { if (document.visibilityState === "visible") requestUpdate(registration); };
      window.addEventListener("online", updateOnOnline);
      window.addEventListener("focus", updateOnFocus);
      document.addEventListener("visibilitychange", updateOnVisible);
      cleanupCallbacks.push(() => { window.removeEventListener("online", updateOnOnline); window.removeEventListener("focus", updateOnFocus); document.removeEventListener("visibilitychange", updateOnVisible); });
      intervalId = window.setInterval(() => requestUpdate(registration), 1000 * 60 * 60 * 6);
      requestUpdate(registration);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      cleanupCallbacks.forEach((cleanup) => cleanup());
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [enabled]);
  return null;
}
