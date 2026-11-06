"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordRefreshDiagnostic } from "@/lib/client/refresh-diagnostics";
import { navigateToSessionExpired } from "@/lib/client/session-expired-navigation";
import { reconcileCurrentDevicePush } from "@/lib/push/client";

const RESUME_MIN_INTERVAL_MS = 15_000;
const PUSH_MIN_INTERVAL_MS = 1_000;

export function AppResumeSync({ pushEnabled, initialUnreadCount }: { pushEnabled: boolean; initialUnreadCount: number }) {
  const router = useRouter();
  const lastSyncRef = useRef(0);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const unreadCountRef = useRef(initialUnreadCount);
  const expiredRef = useRef(false);

  useEffect(() => {
    unreadCountRef.current = initialUnreadCount;
  }, [initialUnreadCount]);

  const sync = useCallback(async (source: "resume" | "push") => {
    if (document.visibilityState !== "visible" || expiredRef.current) return;
    const now = Date.now();
    if (syncPromiseRef.current) return syncPromiseRef.current;
    if (now - lastSyncRef.current < (source === "push" ? PUSH_MIN_INTERVAL_MS : RESUME_MIN_INTERVAL_MS)) return;

    lastSyncRef.current = now;
    const task = (async () => {
      try {
        await reconcileCurrentDevicePush(pushEnabled).catch(() => undefined);
        const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (response.status === 401) {
          expiredRef.current = true;
          navigateToSessionExpired(router, "resume-session-expired");
          return;
        }
        if (!response.ok) return;

        const body = await response.json() as { unreadCount?: number };
        if (typeof body.unreadCount !== "number" || !Number.isFinite(body.unreadCount) || body.unreadCount < 0) return;
        const unreadCount = Math.trunc(body.unreadCount);
        const badgeNavigator = navigator as Navigator & {
          setAppBadge?: (contents?: number) => Promise<void>;
          clearAppBadge?: () => Promise<void>;
        };
        if (unreadCount > 0 && badgeNavigator.setAppBadge) {
          await badgeNavigator.setAppBadge(unreadCount).catch(() => undefined);
        } else if (unreadCount === 0 && badgeNavigator.clearAppBadge) {
          await badgeNavigator.clearAppBadge().catch(() => undefined);
        }
        // Revalidate server-rendered navigation badges only when their data
        // changed. Focus/pageshow/online alone must never refresh the Console.
        if (unreadCount !== unreadCountRef.current) {
          unreadCountRef.current = unreadCount;
          recordRefreshDiagnostic("resume-unread-count-changed");
          router.refresh();
        }
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
      if (document.visibilityState === "visible") void sync("resume");
    };
    const onFocus = () => void sync("resume");
    const onPageShow = () => void sync("resume");
    const onOnline = () => void sync("resume");
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "DTSC_PUSH_RECEIVED") void sync("push");
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
