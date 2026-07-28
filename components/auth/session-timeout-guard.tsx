"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  SESSION_DEFAULT_IDLE_TIMEOUT_MINUTES,
  SESSION_HEARTBEAT_THROTTLE_MS,
  SESSION_WARNING_MIN_SECONDS,
} from "@/lib/session-config";

const CHANNEL_NAME = "dtsc-session";
const STORAGE_EVENT_KEY = "dtsc-session-sync";
const LAST_ACTIVITY_KEY = "dtsc-session-last-activity";
const ACTIVITY_BROADCAST_THROTTLE_MS = 5_000;

type SessionHeartbeatResponse = {
  ok: true;
  expiresAt: string;
  idleTimeoutMinutes: number;
  absoluteExpiresAt: string | null;
  warningSeconds: number;
};

type SessionSyncMessage =
  | { type: "activity"; at: number }
  | { type: "session"; expiresAt: number; absoluteExpiresAt: number | null; idleTimeoutMinutes: number; warningSeconds: number }
  | { type: "logout"; at: number };

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function readStoredActivity() {
  try {
    const stored = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
  } catch {
    return Date.now();
  }
}

export function SessionTimeoutGuard() {
  const router = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState(SESSION_WARNING_MIN_SECONDS);
  const [showWarning, setShowWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const lastActivityBroadcastRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const expiresAtRef = useRef(0);
  const absoluteExpiresAtRef = useRef<number | null>(null);
  const idleTimeoutMinutesRef = useRef<number>(SESSION_DEFAULT_IDLE_TIMEOUT_MINUTES);
  const warningSecondsRef = useRef(SESSION_WARNING_MIN_SECONDS);
  const expiredRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatPromiseRef = useRef<Promise<boolean> | null>(null);

  const publish = useCallback((message: SessionSyncMessage) => {
    channelRef.current?.postMessage(message);
    try {
      window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify({ ...message, nonce: crypto.randomUUID?.() || String(Math.random()) }));
    } catch {
      // BroadcastChannel remains the primary synchronization mechanism when storage is unavailable.
    }
  }, []);

  const redirectExpired = useCallback(() => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    setShowWarning(false);
    publish({ type: "logout", at: Date.now() });
    router.push("/session-expired");
    router.refresh();
  }, [publish, router]);

  const applySession = useCallback((body: SessionHeartbeatResponse, broadcast = true) => {
    const expiresAt = new Date(body.expiresAt).getTime();
    const absoluteExpiresAt = body.absoluteExpiresAt ? new Date(body.absoluteExpiresAt).getTime() : null;
    if (!Number.isFinite(expiresAt)) return;

    expiresAtRef.current = expiresAt;
    absoluteExpiresAtRef.current = absoluteExpiresAt && Number.isFinite(absoluteExpiresAt) ? absoluteExpiresAt : null;
    idleTimeoutMinutesRef.current = body.idleTimeoutMinutes;
    warningSecondsRef.current = body.warningSeconds;
    expiredRef.current = false;

    if (broadcast) {
      publish({
        type: "session",
        expiresAt,
        absoluteExpiresAt: absoluteExpiresAtRef.current,
        idleTimeoutMinutes: body.idleTimeoutMinutes,
        warningSeconds: body.warningSeconds,
      });
    }
  }, [publish]);

  const heartbeat = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHeartbeatRef.current < SESSION_HEARTBEAT_THROTTLE_MS) {
      return true;
    }
    if (heartbeatPromiseRef.current) {
      return heartbeatPromiseRef.current;
    }

    lastHeartbeatRef.current = now;
    const request = (async () => {
      try {
        const response = await fetch("/api/auth/heartbeat", { method: "POST", cache: "no-store" });
        if (response.status === 401) {
          redirectExpired();
          return false;
        }
        if (!response.ok) {
          return false;
        }
        const body = await response.json() as SessionHeartbeatResponse;
        applySession(body);
        return true;
      } catch {
        return false;
      } finally {
        heartbeatPromiseRef.current = null;
      }
    })();
    heartbeatPromiseRef.current = request;
    return request;
  }, [applySession, redirectExpired]);

  const registerActivity = useCallback(() => {
    if (expiredRef.current) return;
    const now = Date.now();
    lastActivityRef.current = now;

    if (now - lastActivityBroadcastRef.current >= ACTIVITY_BROADCAST_THROTTLE_MS) {
      lastActivityBroadcastRef.current = now;
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {
        // Activity remains valid in-memory if storage is unavailable.
      }
      publish({ type: "activity", at: now });
    }

    setShowWarning(false);
    void heartbeat(false);
  }, [heartbeat, publish]);

  const keepConnected = useCallback(async () => {
    const ok = await heartbeat(true);
    if (ok) {
      registerActivity();
    }
  }, [heartbeat, registerActivity]);

  useEffect(() => {
    lastActivityRef.current = readStoredActivity();

    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    }

    const handleSyncMessage = (message: SessionSyncMessage) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "activity") {
        lastActivityRef.current = Math.max(lastActivityRef.current, message.at);
        setShowWarning(false);
        return;
      }
      if (message.type === "session") {
        expiresAtRef.current = Math.max(expiresAtRef.current, message.expiresAt);
        absoluteExpiresAtRef.current = message.absoluteExpiresAt;
        idleTimeoutMinutesRef.current = message.idleTimeoutMinutes;
        warningSecondsRef.current = message.warningSeconds;
        lastHeartbeatRef.current = Date.now();
        expiredRef.current = false;
        return;
      }
      if (message.type === "logout") {
        expiredRef.current = true;
        setShowWarning(false);
        router.push("/session-expired");
        router.refresh();
      }
    };

    const channel = channelRef.current;
    const onChannelMessage = (event: MessageEvent<SessionSyncMessage>) => handleSyncMessage(event.data);
    channel?.addEventListener("message", onChannelMessage);

    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
        const at = Number(event.newValue);
        if (Number.isFinite(at)) lastActivityRef.current = Math.max(lastActivityRef.current, at);
        return;
      }
      if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
      try {
        handleSyncMessage(JSON.parse(event.newValue) as SessionSyncMessage);
      } catch {
        // Ignore malformed local synchronization messages.
      }
    };
    window.addEventListener("storage", onStorage);

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((eventName) => window.addEventListener(eventName, registerActivity, { passive: true }));

    const verifyOnResume = () => {
      if (document.visibilityState === "visible") {
        lastActivityRef.current = Math.max(lastActivityRef.current, readStoredActivity());
        void heartbeat(true);
      }
    };
    const onFocus = () => void heartbeat(true);
    const onPageShow = () => void heartbeat(true);
    document.addEventListener("visibilitychange", verifyOnResume);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    void heartbeat(true);

    const countdownInterval = window.setInterval(() => {
      if (!expiresAtRef.current || expiredRef.current) return;
      const now = Date.now();
      const remainingMs = expiresAtRef.current - now;
      const nextRemainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setRemainingSeconds(nextRemainingSeconds);

      if (remainingMs <= 0) {
        // Timers can be stale after sleep. The server is the source of truth before expiring the shared SSO session.
        void heartbeat(true);
        return;
      }

      setShowWarning(remainingMs <= warningSecondsRef.current * 1000);
    }, 1000);

    return () => {
      window.clearInterval(countdownInterval);
      events.forEach((eventName) => window.removeEventListener(eventName, registerActivity));
      document.removeEventListener("visibilitychange", verifyOnResume);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onChannelMessage);
      channel?.close();
      channelRef.current = null;
    };
  }, [heartbeat, registerActivity, router]);

  return (
    <Dialog
      open={showWarning}
      title="Session bientôt expirée"
      description="Votre période d'inactivité arrive à son terme. Le serveur vérifiera votre session avant toute déconnexion."
      onClose={() => setShowWarning(false)}
      footer={
        <Button type="button" onClick={() => void keepConnected()} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          Rester connecté
        </Button>
      }
    >
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="font-black text-dtsc-ink">Votre session expire dans</p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-black text-dtsc-blue">
              <Clock3 className="h-6 w-6 text-cyan-500" />
              {formatCountdown(remainingSeconds)}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-dtsc-muted">
          « Rester connecté » demande un renouvellement réel au serveur. Une session ne peut jamais dépasser sa durée absolue de sécurité.
        </p>
      </div>
    </Dialog>
  );
}
