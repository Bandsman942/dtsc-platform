import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, ClipboardCheck, FileText, GraduationCap, Layers3, Megaphone } from "lucide-react";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";
import { PublicSectionWatermark } from "@/components/public/public-section-watermark";

export const metadata: Metadata = {
  title: "Contact DTSC — cadrer votre besoin et choisir le bon levier",
  description: "Contactez DTSC pour qualifier votre besoin client et choisir le bon levier numérique: Data & BI, IA, Solutions digitales, audit, formations, marketing ou imprimerie.",
  alternates: { canonical: "/contact" },
};

const qualificationCards = [
  { title: "Je veux mieux piloter mon entreprise", lever: "Data & BI", icon: BarChart3 },
  { title: "Je veux intégrer l'IA", lever: "Intelligence artificielle", icon: Bot },
  { title: "Je veux créer une solution digitale", lever: "Solutions digitales", icon: Layers3 },
  { title: "Je veux auditer mes processus", lever: "Audit & optimisation", icon: ClipboardCheck },
  { title: "Je veux former mon équipe", lever: "Formations", icon: GraduationCap },
  { title: "Je veux améliorer ma visibilité", lever: "Marketing digital", icon: Megaphone },
  { title: "Je veux des supports imprimés professionnels", lever: "Imprimerie numérique", icon: FileText },
];

const contactSteps = [
  "Vous décrivez le besoin",
  "DTSC analyse le contexte",
  "DTSC propose le levier prioritaire",
  "DTSC recommande une première action",
  "DTSC accompagne l'exécution",
];

const contactFaqs = [
  {
    question: "Que faut-il préparer avant de contacter DTSC ?",
    answer:
      "Préparez votre objectif, vos contraintes, les processus ou données concernés, les personnes impliquées et le résultat que vous voulez mesurer.",
  },
  {
    question: "Peut-on demander seulement un audit ?",
    answer:
      "Oui. Un audit peut être le premier livrable pour identifier les pertes, coûts, anomalies et leviers prioritaires avant toute solution.",
  },
  {
    question: "Peut-on commencer par une formation ?",
    answer:
      "Oui. Une formation peut être pertinente si vos équipes doivent comprendre la data, les KPI, l'IA ou l'adoption d'un nouvel outil.",
  },
  {
    question: "DTSC accompagne-t-il les petites structures ?",
    answer:
      "Oui. DTSC peut proposer un cadrage progressif avec un premier livrable limité, utile et mesurable pour les PME et organisations en croissance.",
  },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <section className="relative overflow-hidden border-b border-dtsc-border bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#00a7c7] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.18),transparent_30%)]" />
        <div className="dtsc-premium-reveal relative mx-auto w-full max-w-7xl min-w-0 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-200">Contact professionnel</p>
          <h1 className="dtsc-text-shimmer mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">Parlez-nous de votre besoin autour des 7 leviers DTSC.</h1>
          <p className="dtsc-premium-reveal-delay mt-5 max-w-3xl text-lg leading-8 text-blue-50">
            DTSC qualifie les demandes avec une logique conseil: contexte, objectifs, contraintes, urgence et prochaines étapes. Les échanges commerciaux ou stratégiques restent validés par l&apos;équipe humaine.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
              <Link href="#contact-form">
                Décrire mon besoin
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15">
              <Link href="/services">Comparer les 7 leviers</Link>
            </Button>
          </div>
          <div className="mt-8 grid min-w-0 gap-4 sm:grid-cols-3">
            {[
              ["Email", dtsc.email],
              ["WhatsApp", dtsc.whatsapp],
              ["Réseaux", dtsc.socialHandle],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">{label}</p>
                <p className="mt-2 break-words font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-dtsc-border dtsc-public-band-light">
        <PublicSectionWatermark
          position="right"
          image="/watermarks/dtsc-7-leviers-watermark.jpg"
          className="opacity-[0.04]"
        />
        <div className="relative z-10 mx-auto w-full max-w-7xl min-w-0 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Avant de nous écrire</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Choisissez le besoin qui ressemble le plus à votre situation.</h2>
            </div>
            <p className="leading-7 text-dtsc-muted">
              Ces cartes ne remplacent pas le formulaire: elles vous aident à formuler votre demande avec le bon levier DTSC et à obtenir une réponse plus exploitable.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {qualificationCards.map((item, index) => (
              <Link
                key={item.title}
                href="#contact-form"
                className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover dtsc-premium-reveal p-6`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <item.icon className="h-6 w-6 text-cyan-500" />
                <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
                <p className="mt-3 rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-black text-dtsc-blue">{item.lever}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Préparer ma demande
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-dtsc-border dtsc-public-band-cyan">
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Mini-parcours</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">De votre message à une action prioritaire.</h2>
            <p className="mt-4 leading-7 text-dtsc-muted">
              DTSC transforme une demande générale en cadrage exploitable: problème, levier, livrable, résultat à mesurer et prochaine étape.
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {contactSteps.map((step, index) => (
              <div key={step} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_12px_34px_rgba(0,43,91,0.08)]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Étape {String(index + 1).padStart(2, "0")}</p>
                <p className="mt-2 font-black text-dtsc-ink">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact-form" className="dtsc-public-band-light pt-16">
        <ContactNewsletterSection contactEmail={dtsc.email} />
      </section>

      <section className="border-t border-dtsc-border dtsc-public-band-soft">
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Questions contact</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Clarifier votre demande avant l&apos;envoi.</h2>
          </div>
          <Accordion>
            {contactFaqs.map((item, index) => (
              <AccordionItem key={item.question} title={item.question} defaultOpen={index === 0}>
                {item.answer}
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
