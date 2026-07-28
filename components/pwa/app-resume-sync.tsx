"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { reconcileCurrentDevicePush } from "@/lib/push/client";

export function AppResumeSync({ pushEnabled }: { pushEnabled: boolean }) {
  const router = useRouter();
  const lastSyncRef = useRef(0);
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const sync = useCallback(async (force = false) => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 15_000) return;
    if (syncPromiseRef.current) return syncPromiseRef.current;

    lastSyncRef.current = now;
    const task = (async () => {
      try {
        await reconcileCurrentDevicePush(pushEnabled).catch(() => undefined);
        const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/session-expired");
          router.refresh();
          return;
        }
        if (!response.ok) return;

        const body = await response.json() as { unreadCount?: number };
        const unreadCount = Math.max(0, Number(body.unreadCount) || 0);
        const badgeNavigator = navigator as Navigator & {
          setAppBadge?: (contents?: number) => Promise<void>;
          clearAppBadge?: () => Promise<void>;
        };
        if (unreadCount > 0 && badgeNavigator.setAppBadge) {
          await badgeNavigator.setAppBadge(unreadCount).catch(() => undefined);
        } else if (unreadCount === 0 && badgeNavigator.clearAppBadge) {
          await badgeNavigator.clearAppBadge().catch(() => undefined);
        }
        router.refresh();
      } catch {
        // Resume synchronization is best-effort; the current rendered state stays usable offline/degraded.
      } finally {
        syncPromiseRef.current = null;
      }
    })();
    syncPromiseRef.current = task;
    return task;
  }, [pushEnabled, router]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync(true);
    };
    const onFocus = () => void sync(false);
    const onPageShow = () => void sync(true);
    const onOnline = () => void sync(true);
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "DTSC_PUSH_RECEIVED") void sync(false);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [sync]);

  return null;
}
