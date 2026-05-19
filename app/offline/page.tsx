import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle, Mail, WifiOff } from "lucide-react";
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
    <main className="min-h-screen bg-[#071427] px-4 py-8 text-white">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-cyan-300/25 bg-white/8 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/15 text-cyan-200">
            <WifiOff className="h-7 w-7" />
          </div>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Mode hors ligne</p>
          <h1 className="mt-3 text-4xl font-black leading-tight">Vous êtes actuellement hors ligne.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-100">
            Certaines fonctionnalités de DTSC Platform nécessitent une connexion Internet. Les contenus ci-dessous restent disponibles pour garder les informations DTSC essentielles à portée de main.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-3xl border border-white/10 bg-white/8 p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">À propos</p>
            <h2 className="mt-2 text-2xl font-black">{dtsc.fullName}</h2>
            <p className="mt-1 text-sm font-bold text-cyan-100">{dtsc.slogan}</p>
            <p className="mt-4 text-sm leading-7 text-blue-100">{dtsc.summary}</p>
            <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-[#06111f] p-4">
              <p className="font-black">Mission</p>
              <p className="mt-2 text-sm leading-7 text-blue-100">{dtsc.mission}</p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/8 p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Services DTSC</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {dtsc.services.map((service) => (
                <div key={service} className="rounded-2xl border border-cyan-300/15 bg-[#06111f] p-4 text-sm font-bold leading-6 text-blue-100">
                  {service}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/8 p-6">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-cyan-200" />
            <h2 className="text-2xl font-black">FAQ disponible hors ligne</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {offlineFaq.map((item) => (
              <article key={item.question} className="rounded-2xl border border-cyan-300/15 bg-[#06111f] p-4">
                <h3 className="font-black text-white">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-blue-100">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">Contact essentiel</p>
              <p className="mt-2 text-sm leading-7 text-blue-50">
                Email: {dtsc.email} · Site: {dtsc.website}. L&apos;envoi de message et les formulaires nécessitent une connexion.
              </p>
              <p className="mt-1 text-xs font-bold text-cyan-100">Dernière mise à jour du cache: 19/05/2026</p>
            </div>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-[#001736] transition hover:bg-white">
              <Mail className="h-4 w-4" />
              Contact
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
