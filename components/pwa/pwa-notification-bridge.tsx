"use client";

import { useEffect } from "react";

type BrowserNotification = {
  id: string;
  title: string;
  body: string;
  targetUrl: string | null;
};

function excerpt(value: string) {
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}

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

    const storageKey = "dtsc-visible-notifications";
    const seen = getSeenNotifications(storageKey);
    const nextSeen = new Set(seen);

    notifications
      .filter((notification) => !seen.has(notification.id))
      .slice(0, 3)
      .forEach((notification) => {
        const browserNotification = new Notification(notification.title, {
          body: excerpt(notification.body),
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          tag: notification.id,
        });
        browserNotification.onclick = () => {
          window.focus();
          window.location.href = notification.targetUrl || "/notifications";
        };
        nextSeen.add(notification.id);
      });

    localStorage.setItem(storageKey, JSON.stringify(Array.from(nextSeen).slice(-80)));
  }, [enabled, notifications]);

  return null;
}
