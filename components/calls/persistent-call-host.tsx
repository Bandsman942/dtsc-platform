"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mic, MicOff, PhoneCall, PhoneOff, Video, VideoOff } from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PERSISTENT_CALL_HANDOFF_EVENT,
  requestPersistentCallRestore,
  type PersistentCallHandoffDetail,
} from "@/components/calls/persistent-call-events";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "dtsc.active-call-handoff.v1";
const JOIN_PATTERN = /\/api\/collaborators\/calls\/([^/]+)\/join(?:\?|$)/;
const EXIT_PATTERN = /\/api\/collaborators\/calls\/([^/]+)\/(?:leave|end)(?:\?|$)/;

type PersistedCallSession = {
  callId: string;
  token: string;
  livekitUrl: string;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  callType: "AUDIO" | "VIDEO" | "UNKNOWN";
  capturedAt: number;
};

function readSession(): PersistedCallSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCallSession>;
    if (!parsed.callId || !parsed.token || !parsed.livekitUrl || !parsed.capturedAt) return null;
    if (Date.now() - parsed.capturedAt > 6 * 60 * 60 * 1000) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      callId: parsed.callId,
      token: parsed.token,
      livekitUrl: parsed.livekitUrl,
      microphoneEnabled: parsed.microphoneEnabled !== false,
      cameraEnabled: parsed.cameraEnabled === true,
      callType: parsed.callType === "VIDEO" || parsed.callType === "AUDIO" ? parsed.callType : "UNKNOWN",
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
}

function writeSession(session: PersistedCallSession | null) {
  try {
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable in hardened browser modes. The call UI
    // still works normally inside Collaborators; persistence simply degrades.
  }
}

function parseJoinMedia(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return { microphoneEnabled: true, cameraEnabled: false };
  try {
    const parsed = JSON.parse(body) as { microphoneEnabled?: boolean; cameraEnabled?: boolean };
    return { microphoneEnabled: parsed.microphoneEnabled !== false, cameraEnabled: parsed.cameraEnabled === true };
  } catch {
    return { microphoneEnabled: true, cameraEnabled: false };
  }
}

/**
 * Keeps a joined LiveKit call available when the user navigates away from the
 * Collaborators call screen. The existing Collaborators room remains the owner
 * while that screen is open; this host takes over only for cross-screen
 * navigation and exposes a compact call controller from the authenticated shell.
 */
export function PersistentCallHost() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<PersistedCallSession | null>(null);
  const [persistent, setPersistent] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const room = useMemo(() => new Room({ disconnectOnPageLeave: true }), []);
  const activationRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const stored = readSession();
    if (stored) {
      setSession(stored);
      setMicrophoneEnabled(stored.microphoneEnabled);
      setCameraEnabled(stored.cameraEnabled);
      if (!pathname?.startsWith("/collaborators")) setPersistent(true);
    }
  }, [pathname]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const joinMatch = method === "POST" ? requestUrl.match(JOIN_PATTERN) : null;
      const exitMatch = method === "POST" ? requestUrl.match(EXIT_PATTERN) : null;
      const response = await originalFetch(input, init);

      if (joinMatch && response.ok) {
        const payload = await response.clone().json().catch(() => null) as { token?: string; livekitUrl?: string; call?: { callType?: string } } | null;
        if (payload?.token && payload.livekitUrl) {
          const media = parseJoinMedia(init?.body);
          const next: PersistedCallSession = {
            callId: joinMatch[1],
            token: payload.token,
            livekitUrl: payload.livekitUrl,
            microphoneEnabled: media.microphoneEnabled,
            cameraEnabled: media.cameraEnabled,
            callType: payload.call?.callType === "VIDEO" ? "VIDEO" : payload.call?.callType === "AUDIO" ? "AUDIO" : media.cameraEnabled ? "VIDEO" : "UNKNOWN",
            capturedAt: Date.now(),
          };
          writeSession(next);
          setSession(next);
          setMicrophoneEnabled(next.microphoneEnabled);
          setCameraEnabled(next.cameraEnabled);
        }
      }

      if (exitMatch && response.ok) {
        const active = readSession();
        if (!active || active.callId === exitMatch[1]) {
          writeSession(null);
          setSession(null);
          setPersistent(false);
          void room.disconnect();
        }
      }
      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, [room]);

  const activatePersistentCall = useCallback(async () => {
    if (!session || persistent) return;
    if (activationRef.current) return activationRef.current;
    const activation = (async () => {
      setPersistent(true);
      // Connect before the full call surface is removed so the authenticated
      // shell owns an active LiveKit room during the handoff.
      if (room.state === ConnectionState.Disconnected) await room.connect(session.livekitUrl, session.token);
      await room.localParticipant.setMicrophoneEnabled(microphoneEnabled).catch(() => undefined);
      if (session.callType === "VIDEO" || cameraEnabled) {
        await room.localParticipant.setCameraEnabled(cameraEnabled).catch(() => undefined);
      }
    })().finally(() => {
      activationRef.current = null;
    });
    activationRef.current = activation;
    return activation;
  }, [cameraEnabled, microphoneEnabled, persistent, room, session]);

  useEffect(() => {
    if (session && !pathname?.startsWith("/collaborators")) void activatePersistentCall();
  }, [activatePersistentCall, pathname, session]);

  useEffect(() => {
    const handleHandoff = (event: Event) => {
      const detail = (event as CustomEvent<PersistentCallHandoffDetail>).detail;
      if (!detail) return;
      if (!session) {
        detail.reject(new Error("PERSISTENT_CALL_SESSION_NOT_FOUND"));
        return;
      }
      void activatePersistentCall()
        .then(() => detail.resolve())
        .catch((error) => detail.reject(error));
    };
    window.addEventListener(PERSISTENT_CALL_HANDOFF_EVENT, handleHandoff);
    return () => window.removeEventListener(PERSISTENT_CALL_HANDOFF_EVENT, handleHandoff);
  }, [activatePersistentCall, session]);

  useEffect(() => {
    if (!session || !pathname?.startsWith("/collaborators")) return;
    const handleNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(element instanceof HTMLAnchorElement) || element.target === "_blank" || element.hasAttribute("download")) return;
      const target = new URL(element.href, window.location.href);
      if (target.origin !== window.location.origin || target.pathname.startsWith("/collaborators")) return;
      event.preventDefault();
      void activatePersistentCall()
        .catch(() => undefined)
        .finally(() => router.push(`${target.pathname}${target.search}${target.hash}`));
    };
    document.addEventListener("click", handleNavigation, true);
    return () => document.removeEventListener("click", handleNavigation, true);
  }, [activatePersistentCall, pathname, router, session]);

  useEffect(() => {
    const update = () => setConnectionState(room.state);
    room.on(RoomEvent.ConnectionStateChanged, update);
    update();
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, update);
    };
  }, [room]);

  useEffect(() => () => {
    void room.disconnect();
  }, [room]);

  async function toggleMicrophone() {
    const next = !microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next).catch(() => undefined);
    setMicrophoneEnabled(next);
    if (session) {
      const updated = { ...session, microphoneEnabled: next };
      setSession(updated);
      writeSession(updated);
    }
  }

  async function toggleCamera() {
    const next = !cameraEnabled;
    await room.localParticipant.setCameraEnabled(next).catch(() => undefined);
    setCameraEnabled(next);
    if (session) {
      const updated = { ...session, cameraEnabled: next, callType: "VIDEO" as const };
      setSession(updated);
      writeSession(updated);
    }
  }

  async function leaveCall() {
    if (!session) return;
    await fetch(`/api/collaborators/calls/${session.callId}/leave`, { method: "POST" }).catch(() => null);
    writeSession(null);
    setSession(null);
    setPersistent(false);
    await room.disconnect();
  }

  function restoreFullCallWindow() {
    requestPersistentCallRestore();
    window.setTimeout(() => {
      setPersistent(false);
      void room.disconnect();
    }, 1200);
  }

  if (!session || !persistent) return null;

  const connected = connectionState === ConnectionState.Connected;
  return (
    <LiveKitRoom room={room} token={session.token} serverUrl={session.livekitUrl} connect={persistent} audio={microphoneEnabled} video={cameraEnabled} className="contents">
      <RoomAudioRenderer />
      <div className="pointer-events-auto fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[75] flex items-center gap-2 rounded-2xl border border-cyan-300/40 bg-[#06111f]/95 p-2.5 text-white shadow-[0_18px_60px_rgba(0,23,54,0.35)] backdrop-blur-xl sm:bottom-5 sm:left-auto sm:right-5 sm:w-auto sm:max-w-[32rem]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-200"><PhoneCall className="h-4 w-4" /></span>
        <Link href={`/collaborators?joinCall=${encodeURIComponent(session.callId)}`} onClick={restoreFullCallWindow} className="min-w-0 flex-1 px-1">
          <strong className="block truncate text-xs">Appel DTSC en arrière-plan</strong>
          <span className="block truncate text-[0.68rem] text-slate-300">{connected ? "Connecté · toucher pour revenir" : "Reconnexion de l’appel…"}</span>
        </Link>
        <Button type="button" size="icon" variant="ghost" onClick={() => void toggleMicrophone()} className="h-9 w-9 rounded-full text-white hover:bg-white/10" aria-label={microphoneEnabled ? "Couper le microphone" : "Activer le microphone"}>
          {microphoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        {(session.callType === "VIDEO" || cameraEnabled) && (
          <Button type="button" size="icon" variant="ghost" onClick={() => void toggleCamera()} className="h-9 w-9 rounded-full text-white hover:bg-white/10" aria-label={cameraEnabled ? "Couper la caméra" : "Activer la caméra"}>
            {cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
        )}
        <Button type="button" size="icon" onClick={() => void leaveCall()} className="h-9 w-9 rounded-full bg-red-600 text-white hover:bg-red-700" aria-label="Quitter l’appel"><PhoneOff className="h-4 w-4" /></Button>
      </div>
    </LiveKitRoom>
  );
}
