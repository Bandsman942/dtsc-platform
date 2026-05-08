import type { Metadata } from "next";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { dtsc } from "@/lib/dtsc";

export const metadata: Metadata = {
  title: "Demander un avis",
  description: "Contactez DTSC pour une consultation en transformation numérique, data, IA, automatisation, reporting ou application métier.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <section className="relative overflow-hidden border-b border-dtsc-border bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#00a7c7] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.18),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-200">Contact professionnel</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">Parlez-nous de votre besoin numérique, data ou IA.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-blue-50">
            DTSC qualifie les demandes avec une logique conseil: contexte, objectifs, contraintes, urgence et prochaines étapes. Les échanges commerciaux ou stratégiques restent validés par l&apos;équipe humaine.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Email", dtsc.email],
              ["WhatsApp", dtsc.whatsapp],
              ["Réseaux", dtsc.socialHandle],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">{label}</p>
                <p className="mt-2 font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="dtsc-public-band-light pt-16">
        <ContactNewsletterSection contactEmail={dtsc.email} />
      </div>
      <PublicFooter />
    </main>
  );
}
