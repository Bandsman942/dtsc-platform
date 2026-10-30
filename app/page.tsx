import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  Layers3,
  Megaphone,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { LazyPublicAgent } from "@/components/public/lazy-public-agent";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { getDashboardUrl } from "@/lib/domains";

export const metadata: Metadata = {
  title: "Conseil, data, IA et transformation digitale",
  description: "DTSC accompagne les organisations dans la transformation de leurs données et processus en solutions concrètes. Conseil, Data & BI, IA, développement numérique et DTSC Platform.",
  alternates: { canonical: "/" },
};

const levers = [
  { title: "Data & BI", description: "Transformer les données dispersées en indicateurs fiables, dashboards et décisions lisibles.", icon: Database, href: "/bi-kpi" },
  { title: "Intelligence artificielle", description: "Automatiser, assister les équipes et exploiter la connaissance sans perdre le contrôle humain.", icon: BrainCircuit, href: "/ia-entreprise" },
  { title: "Solutions digitales", description: "Construire des applications, workflows, ERP, CRM et portails adaptés aux processus réels.", icon: Layers3, href: "/solutions" },
  { title: "Audit & optimisation", description: "Repérer les pertes, risques, lenteurs et doublons avant de prioriser les améliorations.", icon: ClipboardCheck, href: "/services#audit-optimisation" },
  { title: "Formations", description: "Rendre les dirigeants et équipes autonomes sur la data, l’IA, les KPI et les outils.", icon: GraduationCap, href: "/ressources" },
  { title: "Marketing digital", description: "Structurer la visibilité, les contenus, l’acquisition et le positionnement de marque.", icon: Network, href: "/services#marketing-digital" },
  { title: "Imprimerie numérique", description: "Créer des supports commerciaux cohérents pour relier communication physique et digitale.", icon: FileText, href: "/services#imprimerie-numerique" },
];

const problems = [
  ["Des décisions prises sans indicateurs fiables", "Data & BI clarifie ce qui se passe réellement."],
  ["Des processus dispersés entre papier, messages et fichiers", "Solutions digitales centralise l’exécution et la traçabilité."],
  ["Des tâches répétitives qui consomment le temps des équipes", "L’IA et l’automatisation accélèrent sans supprimer la validation humaine."],
  ["Une visibilité commerciale irrégulière", "Marketing digital et imprimerie structurent un parcours cohérent."],
] as const;

const sectors = [
  "PME et services professionnels",
  "Cliniques et structures de santé",
  "Pharmacies et distribution",
  "Assurances et finance",
  "ONG et institutions",
  "Éducation et formation",
];

const methodology = [
  { step: "01", title: "Diagnostiquer", text: "Comprendre le problème, les utilisateurs, les données, les risques et les contraintes." },
  { step: "02", title: "Prioriser", text: "Choisir le levier principal, les dépendances et le premier résultat mesurable." },
  { step: "03", title: "Construire", text: "Livrer progressivement avec sécurité, documentation, tests et adoption." },
  { step: "04", title: "Mesurer", text: "Suivre les KPI, corriger les écarts et consolider ce qui produit réellement de la valeur." },
];

export default function HomePage() {
  const dashboardUrl = getDashboardUrl();

  return (
    <main className="min-h-screen overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative border-b border-dtsc-border bg-dtsc-surface">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-24 top-16 h-80 w-80 rounded-full border border-cyan-300/35" />
          <div className="absolute right-20 top-32 h-px w-[38rem] rotate-[-18deg] bg-cyan-300/30" />
          <div className="absolute bottom-[-13rem] left-[42%] h-96 w-96 rounded-full border border-blue-200/35" />
        </div>

        <div className="relative mx-auto grid max-w-[92rem] items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-28">
          <div>
            <p className="dtsc-label inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-dtsc-blue">
              <Sparkles className="h-4 w-4" /> Conseil · Technologie · Data · IA
            </p>
            <h1 className="dtsc-display mt-7 max-w-5xl text-dtsc-ink">Transformez vos données et vos processus en résultats concrets.</h1>
            <p className="dtsc-body-lg mt-7 max-w-2xl text-dtsc-muted">
              Du diagnostic à la mise en œuvre, DTSC relie conseil, technologie, data et intelligence artificielle pour simplifier votre activité, éclairer les décisions et accompagner vos équipes.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-dtsc-blue">
              Nos expertises répondent à vos défis métier. DTSC Platform prolonge cet accompagnement par des outils de collaboration, de gestion et de pilotage.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-dtsc-blue px-5 py-3 font-semibold text-white shadow-[var(--dtsc-shadow-md)] transition hover:bg-[var(--dtsc-brand-secondary-hover)]">
                Demander une consultation <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/services" className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-5 py-3 font-semibold text-dtsc-blue transition hover:bg-dtsc-soft">
                Explorer nos expertises
              </Link>
              <Link href={dashboardUrl} className="inline-flex items-center gap-2 px-2 py-3 font-semibold text-dtsc-muted hover:text-dtsc-blue">
                Ouvrir DTSC Platform
              </Link>
            </div>

            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              <div className="border-l-2 border-cyan-400 pl-4"><p className="text-sm font-semibold text-dtsc-ink">Cadrage réel</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Pas de solution avant de comprendre le besoin.</p></div>
              <div className="border-l-2 border-blue-500 pl-4"><p className="text-sm font-semibold text-dtsc-ink">Livraison progressive</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Des résultats testables plutôt qu’un effet vitrine.</p></div>
              <div className="border-l-2 border-emerald-500 pl-4"><p className="text-sm font-semibold text-dtsc-ink">Mesure continue</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Des indicateurs reliés aux décisions.</p></div>
            </div>
          </div>

          <aside className="min-w-0 border-l border-dtsc-border pl-6 sm:pl-10 lg:pl-12">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dtsc-blue">Comment DTSC vous accompagne</p>
            <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-dtsc-ink sm:text-3xl">
              Des réponses concrètes à vos défis quotidiens.
            </h2>
            <div className="mt-7 divide-y divide-dtsc-border border-t border-dtsc-border">
              {levers.slice(0, 3).map((lever) => {
                const Icon = lever.icon;
                return (
                  <Link href={lever.href} key={lever.title} className="group flex min-w-0 items-start gap-4 py-5">
                    <Icon className="mt-1 h-5 w-5 shrink-0 text-dtsc-blue" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-base font-semibold group-hover:text-dtsc-blue">{lever.title}</strong>
                      <span className="mt-1 block text-sm leading-6 text-dtsc-muted">{lever.description}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
            <Link href="/solutions" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-dtsc-blue underline underline-offset-4">
              Voir les solutions <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="dtsc-label text-dtsc-blue">Problèmes clients</p>
            <h2 className="dtsc-h2 mt-4">Le numérique doit résoudre un problème, pas en créer un nouveau.</h2>
            <p className="mt-5 leading-7 text-dtsc-muted">DTSC relie chaque besoin au levier principal, puis ajoute uniquement les capacités complémentaires nécessaires.</p>
          </div>
          <div className="divide-y divide-dtsc-border border-y border-dtsc-border">
            {problems.map(([title, answer]) => (
              <div key={title} className="grid gap-2 py-5 sm:grid-cols-[1fr_1fr]">
                <h3 className="font-semibold text-dtsc-ink">{title}</h3>
                <p className="text-sm leading-6 text-dtsc-muted">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="dtsc-label text-dtsc-blue">Sept leviers numériques</p>
            <h2 className="dtsc-h2 mt-4">Sept domaines d’expertise, adaptés à vos priorités.</h2>
            <p className="mt-5 leading-7 text-dtsc-muted">Nous combinons les bonnes compétences selon votre situation : données, automatisation, outils métiers, accompagnement et communication.</p>
          </div>

          <div className="mt-10 grid min-w-0 gap-x-10 md:grid-cols-2 xl:grid-cols-3">
            {levers.map((lever) => {
              const Icon = lever.icon;
              return (
                <Link key={lever.title} href={lever.href} className="group block min-w-0 border-t border-dtsc-border py-6 transition-colors">
                  <Icon className="h-6 w-6 text-dtsc-blue" aria-hidden="true" />
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-dtsc-ink group-hover:text-dtsc-blue">{lever.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-dtsc-muted">{lever.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-dtsc-blue">
                    Explorer <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="dtsc-label text-dtsc-blue">Secteurs</p>
            <h2 className="dtsc-h2 mt-4">Des solutions adaptées à votre secteur et à vos contraintes.</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {sectors.map((sector) => (
                <Link key={sector} href="/secteurs" className="flex min-w-0 items-center gap-3 border-b border-dtsc-border py-4 font-medium text-dtsc-ink transition-colors hover:text-dtsc-blue">
                  <ShieldCheck className="h-5 w-5 text-dtsc-blue" />{sector}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="dtsc-label text-dtsc-blue">Méthode DTSC</p>
            <div className="mt-4 divide-y divide-dtsc-border border-y border-dtsc-border">
              {methodology.map((item) => (
                <div key={item.step} className="grid gap-3 py-5 sm:grid-cols-[3rem_1fr]">
                  <span className="text-sm font-bold text-dtsc-blue">{item.step}</span>
                  <div><h3 className="text-lg font-semibold text-dtsc-ink">{item.title}</h3><p className="mt-2 text-sm leading-6 text-dtsc-muted">{item.text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/10 bg-[#001736] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(34,211,238,.23),transparent_31%),radial-gradient(circle_at_88%_12%,rgba(139,92,246,.25),transparent_32%),radial-gradient(circle_at_72%_95%,rgba(236,72,153,.15),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-[92rem] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8 lg:py-20">
          <div>
            <p className="dtsc-label text-cyan-300">DTSC Platform · Produit</p>
            <h2 className="dtsc-h2 mt-4 max-w-4xl text-white">Les prestations DTSC accélèrent la transformation. DTSC Platform consolide son exécution au quotidien.</h2>
            <p className="mt-5 max-w-3xl leading-7 text-slate-200">
              DTSC Platform centralise collaboration, projets, opérations, support, ERP, données et assistants IA dans un écosystème multisous-domaines sécurisé. Elle ne remplace pas les sept leviers : elle les transforme en usages suivis, documentés et mesurables.
            </p>
          </div>
          <Link href={dashboardUrl} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-[#001736] shadow-[0_18px_50px_rgba(0,0,0,.22)] transition hover:-translate-y-0.5">
            Accéder à DTSC Platform <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="dtsc-label text-dtsc-blue">Ressources</p>
            <h2 className="dtsc-h2 mt-4">Apprendre avant d’investir.</h2>
            <p className="mt-5 leading-7 text-dtsc-muted">Consultez les publications réellement disponibles, les guides et les analyses DTSC. Aucun cas client ou résultat n’est présenté sans preuve autorisée.</p>
            <Link href="/ressources" className="mt-7 inline-flex items-center gap-2 font-semibold text-dtsc-blue">Voir les ressources publiées <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid min-w-0 gap-6 sm:grid-cols-3">
            <Link href="/bi-kpi" className="group block border-t border-dtsc-border pt-5">
              <BarChart3 className="h-6 w-6 text-dtsc-blue" aria-hidden="true" />
              <h3 className="mt-3 font-semibold group-hover:text-dtsc-blue">Data & KPI</h3>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">Comprendre les indicateurs utiles et leurs limites.</p>
            </Link>
            <Link href="/ia-entreprise" className="group block border-t border-dtsc-border pt-5">
              <Bot className="h-6 w-6 text-dtsc-blue" aria-hidden="true" />
              <h3 className="mt-3 font-semibold group-hover:text-dtsc-blue">IA appliquée</h3>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">Identifier les usages responsables et mesurables.</p>
            </Link>
            <Link href="/ressources" className="group block border-t border-dtsc-border pt-5">
              <Megaphone className="h-6 w-6 text-dtsc-blue" aria-hidden="true" />
              <h3 className="mt-3 font-semibold group-hover:text-dtsc-blue">Croissance digitale</h3>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">Relier contenu, acquisition et supports commerciaux.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl"><p className="dtsc-label text-dtsc-blue">Passer à l’action</p><h2 className="dtsc-h2 mt-4">Commençons par clarifier le résultat attendu.</h2></div>
          <ContactNewsletterSection />
        </div>
      </section>

      <PublicFooter />
      <LazyPublicAgent />
    </main>
  );
}
