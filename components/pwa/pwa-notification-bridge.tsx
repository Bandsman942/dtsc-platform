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

    const nextNotifications = notifications
      .filter((notification) => !seen.has(notification.id))
      .slice(0, 3);

    const showNotification = async (notification: BrowserNotification) => {
      const options = {
        body: excerpt(notification.body),
        icon: "/dtsc-logo.png",
        badge: "/icons/notification-badge.png",
        tag: notification.id,
        data: { url: notification.targetUrl || "/notifications" },
      };
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(notification.title, options);
        } else {
          const browserNotification = new Notification(notification.title, options);
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
    };

    nextNotifications.forEach((notification) => {
      void showNotification(notification);
    });
  }, [enabled, notifications]);

  return null;
}
