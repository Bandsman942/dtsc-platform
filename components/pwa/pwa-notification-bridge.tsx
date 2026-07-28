"use client";

import { useEffect } from "react";

 type BrowserNotification = {
  id: string;
  title: string;
  body: string;
  targetUrl: string | null;
};

function getSeenNotifications(storageKey: string) {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(storageKey) || "[]"));
  } catch {
    return new Set<string>();
  }
}

export function PwaNotificationBridge({
  notifications,
  enabled,
}: {
  notifications: BrowserNotification[];
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    let disposed = false;
    const storageKey = "dtsc-visible-notifications";

    const run = async () => {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        const activePushSubscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
        if (activePushSubscription || disposed) {
          return;
        }
      }

      const seen = getSeenNotifications(storageKey);
      const nextSeen = new Set(seen);
      const nextNotifications = notifications.filter((notification) => !seen.has(notification.id)).slice(0, 3);

      for (const notification of nextNotifications) {
        const options = {
          body: "Ouvrez DTSC Platform pour consulter les détails.",
          icon: "/dtsc-logo.png",
          badge: "/icons/notification-badge.png",
          tag: `foreground-${notification.id}`,
          data: { url: notification.targetUrl || "/notifications" },
        };
        try {
          if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification("Nouvelle notification DTSC", options);
          } else {
            const browserNotification = new Notification("Nouvelle notification DTSC", options);
            browserNotification.onclick = () => {
              window.focus();
              window.location.href = notification.targetUrl || "/notifications";
            };
          }
          nextSeen.add(notification.id);
          localStorage.setItem(storageKey, JSON.stringify(Array.from(nextSeen).slice(-80)));
        } catch {
          nextSeen.add(notification.id);
        }
      }
    };

    void run();
    return () => {
      disposed = true;
    };
  }, [enabled, notifications]);

  return null;
}
