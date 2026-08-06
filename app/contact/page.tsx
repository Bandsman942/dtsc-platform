import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gauge,
  GraduationCap,
  Layers3,
  Megaphone,
  Sparkles,
  Target,
} from "lucide-react";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

export const metadata: Metadata = {
  title: "Contact DTSC — transformer un besoin en résultat mesurable",
  description:
    "Présentez votre contexte à DTSC. Nous identifions le levier numérique prioritaire, le premier livrable utile et le résultat à mesurer.",
  alternates: { canonical: "/contact" },
};

const qualificationCards = [
  {
    title: "Mieux piloter mes décisions",
    text: "Structurer les données, KPI et tableaux de bord utiles aux décisions.",
    lever: "Data & BI",
    icon: BarChart3,
    accent: "from-sky-500 to-cyan-400",
    iconClass: "bg-sky-500/12 text-sky-600",
  },
  {
    title: "Intégrer l’IA avec contrôle",
    text: "Identifier un usage concret, mesurable et validé par les équipes.",
    lever: "Intelligence artificielle",
    icon: Bot,
    accent: "from-violet-500 to-fuchsia-400",
    iconClass: "bg-violet-500/12 text-violet-600",
  },
  {
    title: "Digitaliser un processus",
    text: "Créer une application, un portail, un ERP ou un workflow cohérent.",
    lever: "Solutions digitales",
    icon: Layers3,
    accent: "from-indigo-500 to-blue-400",
    iconClass: "bg-indigo-500/12 text-indigo-600",
  },
  {
    title: "Réduire les pertes et lenteurs",
    text: "Auditer les processus avant d’investir dans une nouvelle solution.",
    lever: "Audit & optimisation",
    icon: ClipboardCheck,
    accent: "from-emerald-500 to-teal-400",
    iconClass: "bg-emerald-500/12 text-emerald-600",
  },
  {
    title: "Faire monter l’équipe en compétence",
    text: "Former sur la data, les KPI, l’IA et l’adoption des outils.",
    lever: "Formations",
    icon: GraduationCap,
    accent: "from-amber-500 to-yellow-300",
    iconClass: "bg-amber-500/12 text-amber-600",
  },
  {
    title: "Développer ma visibilité",
    text: "Relier stratégie de contenu, acquisition et image de marque.",
    lever: "Marketing digital",
    icon: Megaphone,
    accent: "from-pink-500 to-rose-400",
    iconClass: "bg-pink-500/12 text-pink-600",
  },
  {
    title: "Créer des supports professionnels",
    text: "Aligner supports imprimés, communication et parcours commercial.",
    lever: "Imprimerie numérique",
    icon: FileText,
    accent: "from-orange-500 to-amber-400",
    iconClass: "bg-orange-500/12 text-orange-600",
  },
];

const contactSteps = [
  {
    title: "Vous décrivez le contexte",
    text: "Objectif, contraintes, urgence, utilisateurs concernés et situation actuelle.",
  },
  {
    title: "Nous isolons le vrai problème",
    text: "DTSC distingue le besoin métier de la solution supposée.",
  },
  {
    title: "Nous choisissons le levier prioritaire",
    text: "Un levier principal, puis uniquement les capacités complémentaires utiles.",
  },
  {
    title: "Nous cadrons le premier résultat",
    text: "Livrable, délai, responsabilités, risques et indicateur de réussite.",
  },
];

const contactFaqs = [
  {
    question: "Que préparer avant de contacter DTSC ?",
    answer:
      "Préparez votre objectif, les difficultés observées, les personnes impliquées, les données ou processus concernés et le résultat que vous souhaitez mesurer.",
  },
  {
    question: "Dois-je déjà connaître la solution dont j’ai besoin ?",
    answer:
      "Non. Décrivez d’abord le problème. DTSC vous aide à déterminer si le bon point de départ est un audit, une formation, une solution digitale, un travail data, un usage IA ou un autre levier.",
  },
  {
    question: "Peut-on commencer par une intervention limitée ?",
    answer:
      "Oui. Le cadrage peut déboucher sur un premier livrable court et mesurable avant un programme plus large.",
  },
  {
    question: "DTSC accompagne-t-il les PME et les organisations en croissance ?",
    answer:
      "Oui. Le parcours est conçu pour adapter la profondeur du diagnostic, le rythme et le premier investissement à la maturité réelle de l’organisation.",
  },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#041326] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(34,211,238,0.24),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(139,92,246,0.28),transparent_32%),radial-gradient(circle_at_72%_82%,rgba(236,72,153,0.18),transparent_28%),radial-gradient(circle_at_18%_90%,rgba(245,158,11,0.16),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="dtsc-pulse-ring pointer-events-none absolute -right-28 top-12 h-72 w-72 rounded-full border border-cyan-300/30" />
        <div className="dtsc-floating-visual pointer-events-none absolute -left-16 bottom-10 h-44 w-44 rounded-[3rem] border border-violet-300/20 bg-violet-400/10 blur-sm" />

        <div className="relative mx-auto grid w-full max-w-[92rem] items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:px-8 lg:py-24">
          <div className="dtsc-premium-reveal min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200 backdrop-blur-xl">
              <Sparkles className="h-4 w-4" />
              Votre prochain avantage commence ici
            </p>
            <h1 className="dtsc-display mt-7 max-w-5xl text-white">
              Transformons votre besoin en <span className="dtsc-text-shimmer">résultat mesurable.</span>
            </h1>
            <p className="dtsc-premium-reveal-delay dtsc-body-lg mt-7 max-w-3xl text-slate-200">
              Décrivez votre contexte. DTSC identifie le levier numérique prioritaire, le premier livrable utile et l’indicateur qui permettra de vérifier le progrès.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="dtsc-animated-gradient min-h-12 rounded-2xl border-0 px-6 font-black text-[#001736] shadow-[0_20px_60px_rgba(34,211,238,.24)] hover:-translate-y-0.5">
                <Link href="#contact-form">
                  Parler à un expert DTSC
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 rounded-2xl border-white/20 bg-white/10 px-6 font-black text-white backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white/16">
                <Link href="/services">Explorer les 7 leviers</Link>
              </Button>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {[
                [Target, "Un besoin clarifié", "Nous partons du problème réel."],
                [Gauge, "Un résultat défini", "Le succès devient mesurable."],
                [CheckCircle2, "Une décision humaine", "La recommandation reste validée."],
              ].map(([Icon, title, text]) => {
                const ItemIcon = Icon as typeof Target;
                return (
                  <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-xl">
                    <ItemIcon className="h-5 w-5 text-cyan-300" />
                    <p className="mt-3 font-black text-white">{String(title)}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-300">{String(text)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dtsc-floating-visual relative min-w-0">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-cyan-400/20 via-violet-500/20 to-pink-500/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 p-5 shadow-[0_32px_100px_rgba(0,0,0,.34)] backdrop-blur-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Diagnostic express</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Quel résultat recherchez-vous ?</h2>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-cyan-200"><Target className="h-6 w-6" /></span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {qualificationCards.map((item, index) => (
                  <Link
                    key={item.lever}
                    href="#contact-form"
                    className="dtsc-premium-reveal group relative overflow-hidden rounded-2xl border border-white/10 bg-[#071427]/55 p-4 transition hover:-translate-y-1 hover:border-white/25 hover:bg-[#071427]/75"
                    style={{ animationDelay: `${index * 65}ms` }}
                  >
                    <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${item.accent}`} />
                    <item.icon className="h-5 w-5 text-cyan-200" />
                    <p className="mt-3 text-sm font-black text-white">{item.lever}</p>
                    <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-white" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dtsc-public-band-light border-b border-dtsc-border">
        <div className="mx-auto w-full max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] lg:items-end">
            <div>
              <p className="dtsc-label text-cyan-600">Votre priorité</p>
              <h2 className="dtsc-h2 mt-3 text-dtsc-ink">Commencez par le résultat, pas par l’outil.</h2>
            </div>
            <p className="max-w-3xl text-base leading-8 text-dtsc-muted">
              Choisissez la situation qui vous ressemble. Elle préremplit votre réflexion, mais le cadrage final relie toujours le besoin, le levier DTSC, le livrable et la mesure du résultat.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {qualificationCards.map((item, index) => (
              <Link
                key={item.title}
                href="#contact-form"
                className="dtsc-card-hover dtsc-premium-reveal group relative overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface p-6 shadow-[var(--dtsc-shadow-md)]"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <span className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${item.accent}`} />
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.iconClass}`}>
                  <item.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-xl font-black tracking-[-0.03em] text-dtsc-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{item.text}</p>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-dtsc-blue">{item.lever}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue">
                  Préparer ma demande
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="dtsc-public-band-cyan border-b border-dtsc-border">
        <div className="mx-auto grid w-full max-w-[92rem] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:px-8 lg:py-20">
          <div>
            <p className="dtsc-label text-violet-600">Méthode de qualification</p>
            <h2 className="dtsc-h2 mt-3 text-dtsc-ink">De votre message à une décision exploitable.</h2>
            <p className="mt-5 max-w-xl leading-8 text-dtsc-muted">
              Une demande utile ne se résume pas à « je veux une application » ou « je veux de l’IA ». Nous reconstruisons le lien entre le problème, la décision et la valeur attendue.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {contactSteps.map((step, index) => (
              <article key={step.title} className="dtsc-card-hover rounded-[1.35rem] border border-dtsc-border bg-dtsc-surface p-5 shadow-[var(--dtsc-shadow-md)]">
                <div className="flex items-center justify-between gap-4">
                  <span className="dtsc-animated-gradient flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-[#001736]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-cyan-400 via-violet-400 to-transparent" />
                </div>
                <h3 className="mt-5 text-lg font-black tracking-[-0.025em] text-dtsc-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-dtsc-muted">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contact-form" className="dtsc-public-band-light pt-16 lg:pt-20">
        <div className="mx-auto mb-9 max-w-4xl px-4 text-center sm:px-6">
          <p className="dtsc-label text-pink-600">Passer à l’action</p>
          <h2 className="dtsc-h2 mt-3 text-dtsc-ink">Décrivez le contexte. Nous structurerons la prochaine étape.</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-dtsc-muted">
            Plus votre message relie objectif, difficulté actuelle et résultat attendu, plus la première réponse sera précise.
          </p>
        </div>
        <ContactNewsletterSection contactEmail={dtsc.email} />
      </section>

      <section className="dtsc-public-band-soft border-t border-dtsc-border">
        <div className="mx-auto grid w-full max-w-[92rem] gap-9 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)] lg:px-8 lg:py-20">
          <div>
            <p className="dtsc-label text-emerald-600">Questions avant contact</p>
            <h2 className="dtsc-h2 mt-3 text-dtsc-ink">Clarifier sans ralentir votre décision.</h2>
            <p className="mt-4 max-w-xl leading-7 text-dtsc-muted">
              Vous n’avez pas besoin d’un cahier des charges parfait. Un contexte honnête et un objectif clair suffisent pour commencer le cadrage.
            </p>
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
