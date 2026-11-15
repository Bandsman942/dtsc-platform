"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, BadgeCheck, CheckCircle2, Download, Globe2, Laptop, MonitorSmartphone,
  ShieldCheck, Smartphone, WifiOff,
} from "lucide-react";
import { getSignInUrl } from "@/lib/domains";

type InstallPlatform = "android" | "ios" | "windows" | "mac" | "linux";
type BrowserInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const platformOrder: InstallPlatform[] = ["android", "ios", "windows", "mac", "linux"];

const copy = {
  fr: {
    eyebrow: "DTSC Platform · Installation guidée",
    title: "Installez votre espace de travail DTSC.",
    subtitle: "Retrouvez vos outils métier depuis l'écran d'accueil ou le bureau, comme une application, sans fichier APK ou EXE.",
    appDomain: "Vous installez la véritable application DTSC Platform, pas le site vitrine.",
    auto: "Installer maintenant",
    manual: "Voir les étapes d'installation",
    installing: "Installation en cours…",
    installed: "Application ouverte en mode installé",
    accepted: "Installation acceptée. Retrouvez l'icône DTSC sur votre appareil.",
    dismissed: "Installation non confirmée. Vous pouvez réessayer ou suivre le guide.",
    failed: "La fenêtre d'installation n'a pas pu s'ouvrir. Utilisez le menu de votre navigateur.",
    missingPrompt: "Si le navigateur ne propose pas de fenêtre d'installation, suivez les étapes ci-dessous.",
    titleGuide: "Votre guide d'installation",
    platform: "Choisissez votre appareil",
    stepsTitle: "Étapes pour votre appareil",
    firstRun: "Après l'installation",
    firstRunSteps: [
      "Ouvrez l'icône DTSC Platform sur votre appareil.",
      "Connectez-vous avec votre compte DTSC, puis choisissez votre espace autorisé.",
      "Activez les notifications seulement si vous le souhaitez, depuis les paramètres.",
    ],
    internet: "Une connexion est nécessaire pour vos données ERP et vos opérations privées. Hors ligne, une page d'information peut s'afficher, pas vos dossiers.",
    signIn: "Se connecter à DTSC Platform",
    installNote: "L'installation est gratuite. Vos accès et fonctionnalités restent régis par votre abonnement et vos autorisations.",
    platformLabels: { android: "Android", ios: "iPhone / iPad", windows: "Windows", mac: "macOS", linux: "Linux" },
    manualSteps: {
      android: [
        "Ouvrez cette page dans Chrome ou Samsung Internet sur votre téléphone.",
        "Dans le menu ⋮ (Chrome) ou ☰ (Samsung Internet), choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
        "Confirmez l'installation, puis lancez DTSC Platform depuis votre écran d'accueil.",
      ],
      ios: [
        "Ouvrez cette page sur votre iPhone ou iPad, de préférence dans Safari.",
        "Touchez « Partager », puis choisissez « Sur l'écran d'accueil ».",
        "Confirmez « Ajouter » et ouvrez l'icône DTSC Platform sur l'écran d'accueil.",
      ],
      windows: [
        "Ouvrez cette page dans Microsoft Edge ou Google Chrome.",
        "Cliquez sur l'icône d'installation de la barre d'adresse ou utilisez le menu ⋯ du navigateur et l'option « Installer cette application ».",
        "Confirmez ; retrouvez DTSC Platform dans le menu Démarrer ou vos applications.",
      ],
      mac: [
        "Dans Chrome ou Edge, utilisez l'icône d'installation de la barre d'adresse ou le menu du navigateur.",
        "Dans Safari 17 ou plus récent (macOS Sonoma ou ultérieur), utilisez « Fichier » → « Ajouter au Dock ».",
        "Ouvrez DTSC Platform depuis le Dock ou le dossier Applications.",
      ],
      linux: [
        "Ouvrez cette page dans Chrome ou Edge, dans un environnement graphique compatible.",
        "Utilisez l'icône d'installation dans la barre d'adresse ou l'option d'installation du menu du navigateur.",
        "Confirmez, puis ouvrez DTSC Platform depuis votre lanceur d'applications.",
      ],
    },
  },
  en: {
    eyebrow: "DTSC Platform · Guided installation",
    title: "Install your DTSC workspace.",
    subtitle: "Open your work tools from your home screen or desktop, like an app, with no APK or EXE download.",
    appDomain: "You are installing the actual DTSC Platform app, not our marketing website.",
    auto: "Install now",
    manual: "Show installation steps",
    installing: "Installation starting…",
    installed: "Running as an installed app",
    accepted: "Installation accepted. Find the DTSC icon on your device.",
    dismissed: "Installation not confirmed. Try again or follow the guide.",
    failed: "The installation prompt could not open. Use your browser menu instead.",
    missingPrompt: "If your browser does not offer an install prompt, follow the steps below.",
    titleGuide: "Your installation guide",
    platform: "Choose your device",
    stepsTitle: "Steps for your device",
    firstRun: "After installing",
    firstRunSteps: [
      "Open the DTSC Platform icon on your device.",
      "Sign in to your DTSC account and select your authorized workspace.",
      "Enable notifications only if you choose to, from Settings.",
    ],
    internet: "Your ERP data and private operations need an internet connection. Offline, you may see an information page, not your private records.",
    signIn: "Sign in to DTSC Platform",
    installNote: "Installation is free. Access and available tools depend on your subscription and permissions.",
    platformLabels: { android: "Android", ios: "iPhone / iPad", windows: "Windows", mac: "macOS", linux: "Linux" },
    manualSteps: {
      android: [
        "Open this page in Chrome or Samsung Internet on your phone.",
        "Open the ⋮ (Chrome) or ☰ (Samsung Internet) menu, then choose “Install app” or “Add to Home screen”.",
        "Confirm installation, then launch DTSC Platform from your home screen.",
      ],
      ios: [
        "Open this page on your iPhone or iPad, preferably in Safari.",
        "Tap Share, then select “Add to Home Screen”.",
        "Confirm Add, then open the DTSC Platform icon on your home screen.",
      ],
      windows: [
        "Open this page in Microsoft Edge or Google Chrome.",
        "Use the install icon in the address bar, or the browser ⋯ menu and its app installation option.",
        "Confirm, then find DTSC Platform in Start or your installed apps.",
      ],
      mac: [
        "In Chrome or Edge, use the install icon in the address bar or the browser menu.",
        "In Safari 17 or later on macOS Sonoma or later, select File → Add to Dock.",
        "Launch DTSC Platform from the Dock or Applications.",
      ],
      linux: [
        "Open this page in Chrome or Edge on a compatible desktop.",
        "Use the install icon in the address bar or the browser's install option.",
        "Confirm, then launch DTSC Platform from your application launcher.",
      ],
    },
  },
} as const;

function detectPlatform(): InstallPlatform {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(agent)) return "android";
  if (/Windows/i.test(agent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "mac";
  return "linux";
}

export function AppInstallOnboarding({ locale }: { locale: "fr" | "en" }) {
  const t = copy[locale];
  const [platform, setPlatform] = useState<InstallPlatform>("android");
  const [installPrompt, setInstallPrompt] = useState<BrowserInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"accepted" | "dismissed" | "failed" | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true);

    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BrowserInstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setNotice(null);
    };
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt || busy || installed) {
      document.getElementById("dtsc-install-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      setNotice(result.outcome === "accepted" ? "accepted" : "dismissed");
      setInstallPrompt(null);
    } catch {
      setNotice("failed");
      setInstallPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <header className="border-b border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-black text-dtsc-blue" aria-label="DTSC Platform">
            <MonitorSmartphone className="h-6 w-6" aria-hidden="true" />
            DTSC Platform
          </Link>
          <Link href={getSignInUrl("/dashboard")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 py-2 text-sm font-semibold text-dtsc-blue hover:bg-dtsc-soft">
            {t.signIn} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/25 bg-[linear-gradient(135deg,#001736,#00366e_58%,#0c2941)] p-5 text-white shadow-[0_22px_70px_rgba(0,23,54,0.19)] sm:p-9">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-200">
            <Download className="h-4 w-4" aria-hidden="true" /> {t.eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">{t.subtitle}</p>
          <div className="mt-5 inline-flex items-start gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-50">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" aria-hidden="true" />
            <span>{t.appDomain}</span>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || installed}
              onClick={() => void installApp()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-[#001736] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-default disabled:opacity-75"
            >
              {installed ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
              {installed ? t.installed : busy ? t.installing : installPrompt ? t.auto : t.manual}
            </button>
            <a href="#dtsc-install-steps" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              {t.titleGuide} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p role="status" aria-live="polite" className="mt-3 max-w-2xl text-xs leading-6 text-blue-100">
            {notice ? t[notice] : !installPrompt && !installed ? t.missingPrompt : ""}
          </p>
        </section>

        <section id="dtsc-install-steps" aria-labelledby="dtsc-install-guide-title" className="scroll-mt-6 pt-10">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-dtsc-soft text-dtsc-blue">
              <Laptop className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="dtsc-install-guide-title" className="text-2xl font-black tracking-tight">{t.titleGuide}</h2>
              <p className="mt-1 text-sm text-dtsc-muted">{t.platform}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t.platform}>
            {platformOrder.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={platform === value}
                aria-controls="dtsc-install-selected-steps"
                onClick={() => setPlatform(value)}
                className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-dtsc-blue ${platform === value ? "border-dtsc-blue bg-dtsc-blue text-white" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:bg-dtsc-soft"}`}
              >
                {t.platformLabels[value]}
              </button>
            ))}
          </div>

          <div id="dtsc-install-selected-steps" aria-live="polite" className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-black">
              <Smartphone className="h-5 w-5 text-dtsc-blue" aria-hidden="true" /> {t.stepsTitle} · {t.platformLabels[platform]}
            </h3>
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {t.manualSteps[platform].map((step, index) => (
                <li key={step} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-dtsc-soft text-sm font-black text-dtsc-blue">{index + 1}</span>
                  <p className="mt-3 text-sm leading-7 text-dtsc-ink">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="dtsc-install-first-run" className="mt-8 rounded-2xl border border-dtsc-border bg-dtsc-surface p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-6 w-6 text-dtsc-blue" aria-hidden="true" />
            <h2 id="dtsc-install-first-run" className="text-xl font-black">{t.firstRun}</h2>
          </div>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {t.firstRunSteps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-7 text-dtsc-muted">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dtsc-soft font-black text-dtsc-blue">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-7 text-dtsc-muted">
            <WifiOff className="mt-1 h-5 w-5 shrink-0 text-dtsc-blue" aria-hidden="true" />
            {t.internet}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href={getSignInUrl("/dashboard")} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-dtsc-blue px-5 py-3 text-sm font-bold text-white hover:opacity-90">
              {t.signIn} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="inline-flex items-center gap-2 text-xs leading-5 text-dtsc-muted">
              <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {t.installNote}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
