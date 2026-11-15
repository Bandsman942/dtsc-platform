import Link from "next/link";
import { ArrowRight, Download, Laptop, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import { getAppBaseUrl } from "@/lib/domains";

/**
 * Marketing site CTA only: never prompt installation on dtsc-platform.com.
 * The browser's install permission belongs to the APP origin and its manifest.
 */
export function PublicPWAInstallCard({ locale = "fr" }: { locale?: "fr" | "en" }) {
  const english = locale === "en";
  const installUrl = `${getAppBaseUrl()}/install`;

  return (
    <section id="installer-dtsc-platform" aria-labelledby="dtsc-install-public-heading" className="border-y border-dtsc-border bg-dtsc-surface">
      <div className="mx-auto max-w-[92rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="relative isolate overflow-hidden rounded-[1.65rem] border border-cyan-400/25 bg-[linear-gradient(135deg,#001736,#00366e_65%,#08223e)] p-5 text-white shadow-[0_18px_60px_rgba(0,25,55,0.14)] sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden="true" />
          <div className="relative grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                <MonitorSmartphone aria-hidden="true" className="h-4 w-4" />
                {english ? "DTSC Platform · Installable app" : "DTSC Platform · Application installable"}
              </p>
              <h2 id="dtsc-install-public-heading" className="mt-3 max-w-3xl text-2xl font-black tracking-tight sm:text-3xl">
                {english ? "Your workspace, one tap away on mobile and desktop." : "Votre espace DTSC à portée de main, sur mobile et ordinateur."}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100">
                {english
                  ? "Install DTSC Platform from your browser, then sign in securely to access your workspace. No APK or EXE file is required."
                  : "Installez DTSC Platform depuis votre navigateur, puis connectez-vous à votre espace sécurisé. Aucun fichier APK ou EXE n'est nécessaire."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-blue-50">
                <span className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
                  <Smartphone className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                  {english ? "Android · iPhone / iPad" : "Android · iPhone / iPad"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
                  <Laptop className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                  {english ? "Windows · macOS · Linux" : "Windows · macOS · Linux"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                  {english ? "Guided and secure setup" : "Installation guidée et sécurisée"}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href={installUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-center text-sm font-black text-[#001736] shadow-lg shadow-cyan-950/20 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <Download aria-hidden="true" className="h-5 w-5" />
                {english ? "Install DTSC Platform" : "Installer DTSC Platform"}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <p className="max-w-xs text-center text-xs leading-5 text-blue-100 lg:text-left">
                {english
                  ? "Opens our app site to install the correct workspace, with steps for your device."
                  : "Ouvre notre site applicatif pour installer le bon espace, avec un guide adapté à votre appareil."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
