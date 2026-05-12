"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_AT_KEY = "dtsc-pwa-install-dismissed-at";
const DISMISS_DELAY_MS = 1000 * 60 * 60 * 24 * 7;

function canShowPromptAgain() {
  if (typeof window === "undefined") {
    return false;
  }

  const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) || "0");
  return !dismissedAt || Date.now() - dismissedAt > DISMISS_DELAY_MS;
}

export function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();

      if (!canShowPromptAgain()) {
        return;
      }

      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  if (!visible || !installEvent) {
    return null;
  }

  async function installApp() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "dismissed") {
      window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    }
    setVisible(false);
    setInstallEvent(null);
  }

  function dismissPrompt() {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-3xl rounded-2xl border border-cyan-400/40 bg-dtsc-surface p-4 shadow-[0_24px_80px_rgba(0,23,54,0.24)] sm:left-auto sm:right-6 sm:max-w-md">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-dtsc-ink">Installer DTSC Platform</p>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">
                Accédez plus vite à votre espace client, vos conversations, documents et tableaux de bord.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissPrompt}
              className="rounded-full p-1 text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-blue"
              aria-label="Fermer la proposition d'installation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={installApp} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              Installer l&apos;application
            </Button>
            <Button type="button" variant="outline" onClick={dismissPrompt} className="rounded-xl">
              Plus tard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
