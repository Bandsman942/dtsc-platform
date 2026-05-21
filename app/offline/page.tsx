import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, HelpCircle, Mail, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { dtsc } from "@/lib/dtsc";

export const metadata: Metadata = {
  title: "Hors ligne | DTSC Platform",
  description: "Informations DTSC et FAQ consultables hors connexion.",
  robots: { index: false, follow: false },
};

const offlineFaq = [
  {
    question: "Que puis-je consulter hors ligne ?",
    answer: "Cette page garde les informations publiques essentielles de DTSC, les services, les contacts et les réponses fréquentes utiles.",
  },
  {
    question: "Puis-je accéder à mes données privées hors ligne ?",
    answer: "Non. Les conversations, documents, paiements, notifications et espaces privés nécessitent une connexion pour protéger les données utilisateur.",
  },
  {
    question: "Comment contacter DTSC ?",
    answer: `Vous pouvez préparer votre message hors ligne, puis écrire à ${dtsc.email} lorsque la connexion revient.`,
  },
  {
    question: "Que fait DTSC ?",
    answer: "DTSC accompagne les organisations dans la transformation numérique, la data, l'automatisation, l'IA, les applications métier, le marketing digital et l'imprimerie numérique.",
  },
];

export default function OfflinePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-dtsc-page px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] text-dtsc-ink">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-5">
        <header className="dtsc-glass-card flex items-center justify-between gap-3 rounded-[1.75rem] p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-dtsc-navy shadow-[0_18px_45px_rgba(0,43,91,0.25)]">
              <Image src="/dtsc-logo.png" alt="DTSC" fill sizes="48px" className="object-cover" priority />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">DTSC Platform</p>
              <p className="truncate text-sm font-bold text-dtsc-muted">Mode PWA hors ligne</p>
            </div>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
            <WifiOff className="h-5 w-5" />
          </div>
        </header>

        <div className="dtsc-glass-card rounded-[2rem] p-5 sm:p-7">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-dtsc-blue">Connexion indisponible</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-dtsc-ink sm:text-5xl">Vous êtes actuellement hors ligne.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-dtsc-muted">
            Certaines fonctionnalités de DTSC Platform nécessitent une connexion Internet. Les contenus ci-dessous restent disponibles pour garder les informations DTSC essentielles à portée de main.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-dtsc-navy px-4 py-3 text-sm font-black text-white transition hover:bg-dtsc-blue">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dtsc-border bg-dtsc-surface px-4 py-3 text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft">
              <Mail className="h-4 w-4" />
              Contact
            </Link>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="dtsc-card p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">À propos</p>
            <h2 className="mt-2 text-2xl font-black text-dtsc-ink">{dtsc.fullName}</h2>
            <p className="mt-1 text-sm font-bold text-dtsc-blue">{dtsc.slogan}</p>
            <p className="mt-4 text-sm leading-7 text-dtsc-muted">{dtsc.summary}</p>
            <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <p className="flex items-center gap-2 font-black text-dtsc-ink"><ShieldCheck className="h-4 w-4 text-dtsc-blue" /> Mission</p>
              <p className="mt-2 text-sm leading-7 text-dtsc-muted">{dtsc.mission}</p>
            </div>
          </section>

          <section className="dtsc-card p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">Services DTSC</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {dtsc.services.map((service) => (
                <div key={service} className="dtsc-glass-list-item rounded-2xl p-4 text-sm font-bold leading-6 text-dtsc-ink">
                  {service}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="dtsc-card p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-dtsc-blue" />
            <h2 className="text-2xl font-black text-dtsc-ink">FAQ disponible hors ligne</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {offlineFaq.map((item) => (
              <article key={item.question} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                <h3 className="font-black text-dtsc-ink">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-dtsc-muted">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dtsc-glass-card rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">Contact essentiel</p>
              <p className="mt-2 text-sm leading-7 text-dtsc-muted">
                Email: {dtsc.email} · Site: {dtsc.website}. L&apos;envoi de message et les formulaires nécessitent une connexion.
              </p>
              <p className="mt-1 text-xs font-bold text-dtsc-blue">Dernière mise à jour du cache: 21/05/2026</p>
            </div>
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-dtsc-navy px-5 py-3 text-sm font-black text-white transition hover:bg-dtsc-blue">
              Réouvrir DTSC
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
