"use client";

import { useEffect } from "react";

const PRESENCE_HEARTBEAT_MS = 45_000;
const PRESENCE_MIN_REFRESH_MS = 30_000;
const CLIENT_SESSION_KEY = "dtsc:collaboration-presence-session";

function getClientSessionId() {
  try {
    const existing = window.sessionStorage.getItem(CLIENT_SESSION_KEY)?.trim();
    if (existing && existing.length >= 8) return existing;
    const generated = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `presence-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.sessionStorage.setItem(CLIENT_SESSION_KEY, generated);
    return generated;
  } catch {
    return `presence-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function inferClientType(): "MOBILE" | "TABLET" | "DESKTOP" | "PWA" | "UNKNOWN" {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "PWA";
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(userAgent)) return "TABLET";
  if (/android|iphone|ipod|mobile/.test(userAgent)) return "MOBILE";
  return userAgent ? "DESKTOP" : "UNKNOWN";
}

export function useCollaborationPresenceLease() {
  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let inFlight = false;
    let lastOnlineAt = 0;
    const clientSessionId = getClientSessionId();
    const clientType = inferClientType();

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const canReportOnline = () => (
      !stopped
      && document.visibilityState === "visible"
      && window.navigator.onLine !== false
    );

    const scheduleHeartbeat = () => {
      clearTimer();
      if (!canReportOnline()) return;
      timer = window.setTimeout(() => {
        void markOnline(true);
      }, PRESENCE_HEARTBEAT_MS);
    };

    const markOnline = async (force = false) => {
      if (!canReportOnline() || inFlight) return;
      const now = Date.now();
      if (!force && now - lastOnlineAt < PRESENCE_MIN_REFRESH_MS) {
        scheduleHeartbeat();
        return;
      }

      inFlight = true;
      try {
        await fetch("/api/collaborators/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "online", clientSessionId, clientType }),
        });
        lastOnlineAt = Date.now();
      } catch {
        // Presence is best-effort and must never block navigation or shell rendering.
      } finally {
        inFlight = false;
        scheduleHeartbeat();
      }
    };

    const markOffline = (reason: "HIDDEN" | "PAGE_HIDE" | "CLIENT_OFFLINE") => {
      clearTimer();
      if (stopped && reason !== "PAGE_HIDE") return;
      const body = JSON.stringify({ status: "offline", clientSessionId, clientType, reason });
      const payload = new Blob([body], { type: "application/json" });
      if (!window.navigator.sendBeacon?.("/api/collaborators/presence", payload)) {
        void fetch("/api/collaborators/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => null);
      }
    };

    const handleFocus = () => void markOnline();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void markOnline(true);
      else markOffline("HIDDEN");
    };
    const handleOnline = () => void markOnline(true);
    const handleOffline = () => markOffline("CLIENT_OFFLINE");
    const handlePageHide = () => markOffline("PAGE_HIDE");

    void markOnline(true);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopped = true;
      clearTimer();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}

export const COLLABORATION_PRESENCE_CLIENT_BUDGET = {
  heartbeatMs: PRESENCE_HEARTBEAT_MS,
  minRefreshMs: PRESENCE_MIN_REFRESH_MS,
} as const;
