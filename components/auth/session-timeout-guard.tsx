"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SESSION_MAX_AGE_SECONDS, SESSION_WARNING_SECONDS } from "@/lib/session-config";

const timeoutMs = SESSION_MAX_AGE_SECONDS * 1000;
const warningMs = SESSION_WARNING_SECONDS * 1000;
const heartbeatIntervalMs = 45 * 1000;

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function SessionTimeoutGuard() {
  const router = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState(SESSION_WARNING_SECONDS);
  const [showWarning, setShowWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(0);
  const expiredRef = useRef(false);

  async function heartbeat(force = false) {
    if (!force && Date.now() - lastHeartbeatRef.current < heartbeatIntervalMs) {
      return;
    }
    lastHeartbeatRef.current = Date.now();
    const response = await fetch("/api/auth/heartbeat", { method: "POST" });
    if (response.status === 401) {
      await expireSession();
    }
  }

  async function expireSession() {
    if (expiredRef.current) {
      return;
    }
    expiredRef.current = true;
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => null);
    router.push("/session-expired");
  }

  function registerActivity() {
    if (expiredRef.current) {
      return;
    }
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    void heartbeat();
  }

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, registerActivity, { passive: true }));
    void heartbeat(true);

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      const remainingMs = timeoutMs - idleFor;
      const nextRemainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setRemainingSeconds(nextRemainingSeconds);

      if (remainingMs <= 0) {
        void expireSession();
        return;
      }

      setShowWarning(remainingMs <= warningMs);
    }, 1000);

    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, registerActivity));
    };
  }, []);

  return (
    <Dialog
      open={showWarning}
      title="Session bientôt expirée"
      description="Aucune activité récente n'a été détectée dans votre espace DTSC."
      onClose={registerActivity}
      footer={
        <Button type="button" onClick={registerActivity} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
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
          Pour votre sécurité, vous serez redirigé vers la page de session expirée puis invité à vous reconnecter.
        </p>
      </div>
    </Dialog>
  );
}
