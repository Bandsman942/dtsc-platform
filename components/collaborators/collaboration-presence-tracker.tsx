"use client";

import { useEffect } from "react";

const PRESENCE_INTERVAL_MS = 15_000;
const SESSION_STORAGE_KEY = "dtsc.collaboration.presenceSessionId";

type ClientType = "MOBILE" | "TABLET" | "DESKTOP" | "PWA" | "UNKNOWN";

function getClientSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const generated = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function detectClientType(): ClientType {
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (standalone) return "PWA";
  const width = window.innerWidth;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
  if (coarse && width < 768) return "MOBILE";
  if (coarse && width < 1180) return "TABLET";
  if (width >= 1024) return "DESKTOP";
  return "UNKNOWN";
}

export function CollaborationPresenceTracker() {
  useEffect(() => {
    const clientSessionId = getClientSessionId();
    let stopped = false;

    const payload = (status: "online" | "offline", reason?: "HIDDEN" | "PAGE_HIDE" | "CLIENT_OFFLINE") => ({
      status,
      clientSessionId,
      clientType: detectClientType(),
      ...(reason ? { reason } : {}),
    });

    const markOnline = () => {
      if (stopped || document.visibilityState !== "visible") return;
      void fetch("/api/collaborators/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload("online")),
        keepalive: true,
      }).catch(() => null);
    };

    const markOffline = (reason: "HIDDEN" | "PAGE_HIDE" | "CLIENT_OFFLINE") => {
      const body = JSON.stringify(payload("offline", reason));
      const blob = new Blob([body], { type: "application/json" });
      if (!window.navigator.sendBeacon?.("/api/collaborators/presence", blob)) {
        void fetch("/api/collaborators/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => null);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") markOnline();
      else markOffline("HIDDEN");
    };
    const handleOnline = () => markOnline();
    const handleOffline = () => markOffline("CLIENT_OFFLINE");
    const handlePageHide = () => markOffline("PAGE_HIDE");

    markOnline();
    const interval = window.setInterval(markOnline, PRESENCE_INTERVAL_MS);
    window.addEventListener("focus", markOnline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", markOnline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
