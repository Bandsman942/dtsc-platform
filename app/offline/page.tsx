import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Hors ligne",
  description: "Page hors ligne DTSC Platform.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0B1220] px-4 text-white">
      <section className="w-full max-w-xl rounded-3xl border border-white/15 bg-white/8 p-8 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/15 text-cyan-200">
          <WifiOff className="h-7 w-7" />
        </div>
        <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Connexion indisponible</p>
        <h1 className="mt-3 text-3xl font-black leading-tight">Vous êtes hors ligne.</h1>
        <p className="mt-4 text-sm leading-7 text-blue-100">
          Certaines fonctionnalités de DTSC Platform nécessitent une connexion Internet. Vérifiez votre réseau puis réessayez.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-[#001736] transition hover:bg-white"
        >
          Retourner à l&apos;espace client
        </Link>
      </section>
    </main>
  );
}
