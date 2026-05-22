"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneCall, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { playCallSound } from "@/components/calls/call-sounds";
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
  callAlertDisplayDuration: number;
  callSoundVolume: number;
};

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

    async function poll() {
      if (disabledRef.current) {
        return;
      }
      const cursor = cursorRef.current ? `?cursor=${encodeURIComponent(cursorRef.current)}` : "";
      const response = await fetch(`/api/collaborators/calls/events${cursor}`, { cache: "no-store" }).catch(() => null);
      if (response?.status === 401) {
        disabledRef.current = true;
        return;
      }
      if (!response?.ok) {
        return;
      }
      const body = await response.json().catch(() => null) as { events?: CallToastEvent[]; settings?: CallToastSettings; cursor?: string } | null;
      if (cancelled || !body) {
        return;
      }
      if (body.settings) {
        setSettings(body.settings);
      }
      if (body.cursor) {
        cursorRef.current = body.cursor;
      }
      const nextEvents = (body.events || []).filter((event) => {
        if (seenRef.current.has(event.id)) {
          return false;
        }
        seenRef.current.add(event.id);
        return true;
      });
      if (!nextEvents.length || shouldMuteGlobalToast || body.settings?.callNotificationsEnabled === false || body.settings?.floatingCallAlertsEnabled === false) {
        return;
      }
      setEvents((current) => [...nextEvents, ...current].slice(0, 3));
      const soundEnabled = body.settings?.callSoundsEnabled !== false && body.settings?.callAlertSoundEnabled !== false;
      if (soundEnabled) {
        const eventType = nextEvents[0]?.eventType;
        const kind = eventType === "CALL_ENDED" ? "ended" : eventType === "USER_LEFT" ? "left" : eventType === "CALL_INTERRUPTED" ? "warning" : "incoming";
        void playCallSound(kind, body.settings?.callSoundVolume ?? 45);
      }
    }

    void poll();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [shouldMuteGlobalToast]);

  useEffect(() => {
    if (!events.length) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setEvents((current) => current.slice(0, -1));
    }, settings?.callAlertDisplayDuration || 6000);
    return () => window.clearTimeout(timeout);
  }, [events, settings?.callAlertDisplayDuration]);

  if (!events.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-5 sm:w-[23rem]">
      {events.map((event) => (
        <div
          key={event.id}
          className="pointer-events-auto rounded-2xl border border-cyan-300/40 bg-dtsc-surface/95 p-4 text-dtsc-ink shadow-[0_24px_80px_rgba(0,23,54,0.22)] backdrop-blur-xl dark:bg-[#071427]/95"
        >
          <div className="flex items-start gap-3">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", event.callType === "VIDEO" ? "bg-violet-500/15 text-violet-300" : "bg-cyan-500/15 text-cyan-300")}>
              {event.callType === "VIDEO" ? <Video className="h-5 w-5" /> : <PhoneCall className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{event.message}</p>
              <p className="mt-1 truncate text-xs text-dtsc-muted">{event.groupName}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {event.canJoin && (
                  <Link href={event.actionUrl} className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-[#001736] transition hover:bg-cyan-300">
                    Rejoindre
                  </Link>
                )}
                <Link href={event.actionUrl} className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-xs font-black text-dtsc-blue transition hover:border-cyan-300">
                  Voir le groupe
                </Link>
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
  );
}
