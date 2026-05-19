"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    let refreshing = false;
    let disposed = false;
    let intervalId: number | undefined;
    const cleanupCallbacks: Array<() => void> = [];

    function activateWaitingWorker(registration: ServiceWorkerRegistration) {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }

    function requestUpdate(registration: ServiceWorkerRegistration) {
      if (!navigator.onLine) {
        return;
      }
      registration.update().then(() => activateWaitingWorker(registration)).catch(() => undefined);
    }

    function handleControllerChange() {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (disposed) {
        return;
      }
      activateWaitingWorker(registration);

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker(registration);
          }
        });
      });

      const updateOnOnline = () => requestUpdate(registration);
      const updateOnFocus = () => requestUpdate(registration);
      const updateOnVisible = () => {
        if (document.visibilityState === "visible") {
          requestUpdate(registration);
        }
      };

      window.addEventListener("online", updateOnOnline);
      window.addEventListener("focus", updateOnFocus);
      document.addEventListener("visibilitychange", updateOnVisible);
      cleanupCallbacks.push(() => {
        window.removeEventListener("online", updateOnOnline);
        window.removeEventListener("focus", updateOnFocus);
        document.removeEventListener("visibilitychange", updateOnVisible);
      });
      intervalId = window.setInterval(() => requestUpdate(registration), 1000 * 60 * 60 * 6);
      requestUpdate(registration);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      cleanupCallbacks.forEach((cleanup) => cleanup());
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
