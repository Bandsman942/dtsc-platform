"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Download, MonitorSmartphone, ShieldCheck, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PublicPWAInstallCard() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean(navigatorWithStandalone.standalone));

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallEvent(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installEvent) {
      setGuideOpen(true);
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallEvent(null);
  }

  return (
    <section className="border-b border-dtsc-border bg-dtsc-surface">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 overflow-hidden rounded-[1.75rem] border border-cyan-400/30 bg-[radial-gradient(circle_at_10%_0%,rgba(0,194,255,0.18),transparent_30%),linear-gradient(135deg,#001736,#002b5b_48%,#0B1220)] p-6 text-white shadow-[0_24px_80px_rgba(0,43,91,0.22)] lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-cyan-300 text-[#001736] shadow-[0_14px_34px_rgba(0,194,255,0.25)]">
              <MonitorSmartphone className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Application DTSC Platform</p>
              <h2 className="mt-2 max-w-3xl text-3xl font-black leading-tight">
                Installez DTSC Platform sur votre mobile et accédez plus vite à votre espace client.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100">
                L&apos;application installable ouvre directement votre tableau de bord, garde l&apos;authentification obligatoire et facilite l&apos;accès au chatbot, aux tickets, aux documents et aux notifications.
              </p>
              <div className="mt-5 grid gap-3 text-sm font-bold text-blue-50 sm:grid-cols-3">
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <Download className="h-4 w-4 text-cyan-200" />
                  Installation rapide
                </span>
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-cyan-200" />
                  Espace sécurisé
                </span>
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <Wifi className="h-4 w-4 text-cyan-200" />
                  Page hors ligne
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button
              type="button"
              onClick={installApp}
              disabled={installed}
              className="rounded-xl bg-cyan-300 px-6 text-[#001736] hover:bg-white disabled:cursor-default disabled:opacity-80"
            >
              <Download className="h-4 w-4" />
              {installed ? "Application installée" : "Installer l'application"}
            </Button>
            <Button asChild variant="outline" className="rounded-xl border-white/20 bg-white/10 px-6 text-white hover:bg-white/15">
              <Link href="/auth/sign-in">
                Ouvrir l&apos;espace client
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={guideOpen} title="Installer DTSC Platform" onClose={() => setGuideOpen(false)}>
        <div className="space-y-3 text-sm leading-7 text-dtsc-muted">
          <p>
            Si votre navigateur n&apos;affiche pas encore le bouton natif d&apos;installation, ouvrez le menu du navigateur puis choisissez
            <span className="font-black text-dtsc-ink"> Ajouter à l&apos;écran d&apos;accueil</span> ou
            <span className="font-black text-dtsc-ink"> Installer l&apos;application</span>.
          </p>
          <p>
            Sur iPhone ou iPad, utilisez le bouton de partage de Safari puis sélectionnez
            <span className="font-black text-dtsc-ink"> Sur l&apos;écran d&apos;accueil</span>.
          </p>
        </div>
      </Dialog>
    </section>
  );
}
