"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneCall, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { playCallSound } from "@/components/calls/call-sounds";
import { PersistentCallHost } from "@/components/calls/persistent-call-host";
import { cn } from "@/lib/utils";

type CallToastEvent = {
  id: string;
  callId: string;
  groupId: string;
  groupName: string;
  callType: "AUDIO" | "VIDEO";
  eventType: string;
  actorName?: string | null;
  message: string;
  createdAt: string;
  canJoin: boolean;
  actionUrl: string;
};

type CallToastSettings = {
  callSoundsEnabled: boolean;
  callNotificationsEnabled: boolean;
  floatingCallAlertsEnabled: boolean;
  participantEventAlertsEnabled: boolean;
  callAlertSoundEnabled: boolean;
  connectionIssueSoundsEnabled: boolean;
  callAlertDisplayDuration: number;
  callSoundVolume: number;
};

const CALL_EVENT_IDLE_POLL_MS = 12_000;
const CALL_EVENT_ACTIVE_POLL_MS = 5_000;

export function GlobalCallToast() {
  const pathname = usePathname();
  const [events, setEvents] = useState<CallToastEvent[]>([]);
  const [settings, setSettings] = useState<CallToastSettings | null>(null);
  const cursorRef = useRef<string | null>(new Date().toISOString());
  const seenRef = useRef(new Set<string>());
  const disabledRef = useRef(false);

  const shouldMuteGlobalToast = useMemo(() => pathname?.startsWith("/collaborators"), [pathname]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function canPoll() {
      return document.visibilityState === "visible" && navigator.onLine !== false && !disabledRef.current;
    }

    async function poll() {
      if (!canPoll() || inFlight) return false;
      inFlight = true;
      try {
        const cursor = cursorRef.current ? `?cursor=${encodeURIComponent(cursorRef.current)}` : "";
        const response = await fetch(`/api/collaborators/calls/events${cursor}`, { cache: "no-store" }).catch(() => null);
        if (response?.status === 401) {
          disabledRef.current = true;
          return false;
        }
        if (!response?.ok) return false;
        const body = await response.json().catch(() => null) as { events?: CallToastEvent[]; settings?: CallToastSettings; cursor?: string } | null;
        if (cancelled || !body) return false;
        if (body.settings) setSettings(body.settings);
        if (body.cursor) cursorRef.current = body.cursor;
        const nextEvents = (body.events || []).filter((event) => {
          if (seenRef.current.has(event.id)) return false;
          seenRef.current.add(event.id);
          return true;
        });
        if (!nextEvents.length || shouldMuteGlobalToast || body.settings?.callNotificationsEnabled === false || body.settings?.floatingCallAlertsEnabled === false) {
          return nextEvents.length > 0;
        }
        setEvents((current) => [...nextEvents, ...current].slice(0, 3));
        const soundEnabled = body.settings?.callSoundsEnabled !== false && body.settings?.callAlertSoundEnabled !== false;
        if (soundEnabled) {
          const eventType = nextEvents[0]?.eventType;
          const kind = eventType === "CALL_ENDED" ? "ended" : eventType === "CALL_LEFT" || eventType === "USER_LEFT" ? "left" : eventType === "CALL_INTERRUPTED" ? "warning" : eventType === "CALL_RECONNECTED" ? "connected" : "incoming";
          if (kind !== "warning" || body.settings?.connectionIssueSoundsEnabled !== false) {
            void playCallSound(kind, body.settings?.callSoundVolume ?? 45);
          }
        }
        return true;
      } finally {
        inFlight = false;
      }
    }

    function schedule(delay: number) {
      clearTimer();
      if (cancelled || disabledRef.current) return;
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (!canPoll()) {
          schedule(CALL_EVENT_IDLE_POLL_MS);
          return;
        }
        const hadEvents = await poll();
        schedule(hadEvents ? CALL_EVENT_ACTIVE_POLL_MS : CALL_EVENT_IDLE_POLL_MS);
      }, delay);
    }

    async function wake() {
      if (!canPoll()) {
        clearTimer();
        return;
      }
      clearTimer();
      const hadEvents = await poll();
      schedule(hadEvents ? CALL_EVENT_ACTIVE_POLL_MS : CALL_EVENT_IDLE_POLL_MS);
    }

    void wake();
    const onVisibilityChange = () => { void wake(); };
    const onOnline = () => { void wake(); };
    const onOffline = () => clearTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [shouldMuteGlobalToast]);

  useEffect(() => {
    if (!events.length) return;
    const timeout = window.setTimeout(() => {
      setEvents((current) => current.slice(0, -1));
    }, settings?.callAlertDisplayDuration || 6000);
    return () => window.clearTimeout(timeout);
  }, [events, settings?.callAlertDisplayDuration]);

  return (
    <>
      <PersistentCallHost />
      {events.length ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-4 z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-5 sm:w-[23rem]">
          {events.map((event) => (
            <div key={event.id} className="pointer-events-auto rounded-2xl border border-cyan-300/40 bg-dtsc-surface/95 p-4 text-dtsc-ink shadow-[0_24px_80px_rgba(0,23,54,0.22)] backdrop-blur-xl dark:bg-[#071427]/95">
              <div className="flex items-start gap-3">
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", event.callType === "VIDEO" ? "bg-violet-500/15 text-violet-300" : "bg-cyan-500/15 text-cyan-300")}>
                  {event.callType === "VIDEO" ? <Video className="h-5 w-5" /> : <PhoneCall className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">{event.message}</p>
                  <p className="mt-1 truncate text-xs text-dtsc-muted">{event.groupName}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.canJoin && <Link href={event.actionUrl} className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-[#001736] transition hover:bg-cyan-300">Rejoindre</Link>}
                    <Link href={event.actionUrl} className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-xs font-black text-dtsc-blue transition hover:border-cyan-300">Voir le groupe</Link>
                  </div>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setEvents((current) => current.filter((item) => item.id !== event.id))} className="h-8 w-8 shrink-0 rounded-full text-dtsc-muted">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Ignorer</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
