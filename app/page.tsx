import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  Landmark,
  Layers3,
  Lightbulb,
  Network,
  Rocket,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UploadCloud,
} from "lucide-react";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

const services = [
  { title: "Transformation numérique", text: "Diagnostic, feuille de route et priorisation des chantiers digitaux à fort impact.", icon: Rocket },
  { title: "Data & Business Intelligence", text: "Modèles de données, indicateurs clés, tableaux de bord et culture de pilotage.", icon: Database },
  { title: "Automatisation & IA", text: "Automatisation de processus, assistants IA et qualification intelligente des demandes.", icon: BrainCircuit },
  { title: "Applications métier", text: "Portails web, outils internes, CRM et solutions sur mesure pour les opérations.", icon: Layers3 },
  { title: "Reporting & dashboards", text: "Reporting opérationnel, Power BI, KPI de performance et suivi décisionnel.", icon: BarChart3 },
  { title: "Conseil technologique", text: "Architecture, choix d'outils, gouvernance digitale et accompagnement des équipes.", icon: Lightbulb },
  { title: "Sécurité & conformité", text: "Bonnes pratiques, contrôle des accès, confidentialité et préparation à la conformité.", icon: ShieldCheck },
];

const solutions = [
  "Chatbot intelligent pour entreprises",
  "Dashboards Power BI",
  "Applications métier sur mesure",
  "Automatisation des processus",
  "Portails clients et CRM",
  "Solutions IA/RAG documentaire",
];

const method = ["Diagnostic", "Feuille de route", "Conception", "Développement", "Déploiement", "Suivi & amélioration continue"];

const sectors = [
  { title: "Santé", icon: Stethoscope },
  { title: "Assurances", icon: ShieldCheck },
  { title: "PME & startups", icon: BriefcaseBusiness },
  { title: "ONG & institutions", icon: Building2 },
  { title: "Éducation", icon: GraduationCap },
  { title: "Finance", icon: Landmark },
  { title: "Administration", icon: ClipboardCheck },
];

const reasons = [
  "Approche orientée résultats",
  "Solutions adaptées au contexte africain",
  "Expertise data, IA et développement",
  "Vision business + technologie",
  "Accompagnement de bout en bout",
  "Livrables professionnels",
];

const projects = [
  { title: "Prototype chatbot DTSC", text: "Qualification des besoins, historique, support, documents et contexte DTSC." },
  { title: "Dashboard de reporting", text: "Vue KPI pour suivre ventes, opérations, coûts, qualité et décisions clés." },
  { title: "Application de gestion interne", text: "Outil métier sécurisé pour centraliser les tâches, utilisateurs et flux." },
  { title: "Système d'automatisation", text: "Réduction des tâches répétitives et meilleure coordination des équipes." },
  { title: "Plateforme client", text: "Espace SaaS avec compte client, notifications, tickets, factures et documents." },
];

const resources = [
  { title: "Articles", href: "/data-afrique", text: "Analyses accessibles sur la data et le numérique en Afrique." },
  { title: "Guides", href: "/bi-kpi", text: "Repères pour mieux piloter les KPI et la Business Intelligence." },
  { title: "Veille Data & IA", href: "/ia-entreprise", text: "Tendances utiles pour intégrer l'IA dans les organisations." },
  { title: "Cas pratiques", href: "/secteurs", text: "Exemples sectoriels pour cadrer les priorités digitales." },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section id="accueil" className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(circle_at_18%_18%,rgba(0,194,255,0.18),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(0,43,91,0.14),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-1.5 text-sm font-black text-dtsc-blue shadow-[0_10px_30px_rgba(0,43,91,0.08)]">
              <Sparkles className="h-4 w-4 text-cyan-500" />
              {dtsc.slogan}
            </p>
            <h1 className="mt-6 max-w-5xl text-4xl font-black leading-tight tracking-tight text-dtsc-ink sm:text-6xl">
              Accélérez votre transformation numérique avec la data, l&apos;IA et des solutions technologiques sur mesure.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-dtsc-muted">
              DTSC accompagne les entreprises dans la conception, l&apos;automatisation et le déploiement de solutions digitales orientées performance.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-[#002b5b] text-white shadow-[0_16px_40px_rgba(0,43,91,0.2)] hover:bg-[#001736]">
                <Link href="#contact">
                  Demander une consultation
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                <Link href="#services">Découvrir nos services</Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-3 border-t border-dtsc-border pt-8 sm:grid-cols-3">
              {["Conseil numérique", "Data & IA", "Applications métier"].map((item) => (
                <div key={item} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-black text-dtsc-ink shadow-[0_8px_24px_rgba(0,43,91,0.05)]">
                  <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-cyan-300/30 via-blue-500/10 to-emerald-300/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.16)]">
              <Image src="/dtsc-logo.png" alt="Identité visuelle DTSC" width={1536} height={864} className="h-64 w-full object-cover sm:h-80" priority />
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {[
                  ["Vision", dtsc.vision],
                  ["Mission", dtsc.mission],
                  ["Marché", "Entreprises, institutions et équipes qui veulent mieux utiliser leurs données."],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-dtsc-border bg-dtsc-soft p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-blue">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-dtsc-muted">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionIntro eyebrow="Services" title="Un accompagnement complet pour passer de la stratégie à l'exécution." text="DTSC combine conseil, data, IA, développement et conduite du changement pour créer des solutions utiles, mesurables et adaptées au terrain." />
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <article key={service.title} className="dtsc-card dtsc-card-hover p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                  <service.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-black text-dtsc-ink">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{service.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="solutions" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-cyan-300/30 bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.18)] sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-cyan-300/10 px-3 py-1.5 text-sm font-black text-cyan-200">
              <Bot className="h-4 w-4" />
              Solutions concrètes
            </p>
            <h2 className="mt-5 text-3xl font-black">Des outils pensés pour les équipes, les clients et les décideurs.</h2>
            <p className="mt-4 leading-7 text-slate-300">
              Chaque solution part d&apos;un besoin métier: gagner du temps, fiabiliser les données, mieux servir les clients ou automatiser une opération critique.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {solutions.map((solution) => (
              <div key={solution} className="dtsc-card dtsc-card-hover flex items-start gap-3 p-5">
                <Network className="mt-0.5 h-5 w-5 shrink-0 text-cyan-500" />
                <p className="font-black text-dtsc-ink">{solution}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="methode" className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionIntro eyebrow="Méthode" title="Une démarche structurée de bout en bout." text="DTSC sécurise le passage de l'idée au résultat opérationnel grâce à un cadrage clair, des livrables concrets et un suivi continu." />
          <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {method.map((step, index) => (
              <div key={step} className="dtsc-card p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dtsc-soft text-sm font-black text-dtsc-blue">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-4 font-black text-dtsc-ink">{step}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="secteurs" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionIntro eyebrow="Secteurs" title="Des interventions adaptées aux réalités métier." text="La même technologie ne crée pas la même valeur selon le secteur. DTSC adapte les priorités, les indicateurs et les parcours aux contraintes de chaque organisation." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sectors.map((sector) => (
            <div key={sector.title} className="dtsc-card dtsc-card-hover flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                <sector.icon className="h-5 w-5" />
              </div>
              <p className="font-black text-dtsc-ink">{sector.title}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="a-propos" className="border-y border-dtsc-border bg-[#001736] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Pourquoi choisir DTSC ?</p>
            <h2 className="mt-3 text-3xl font-black">Une vision business, data et technologie dans un même accompagnement.</h2>
            <p className="mt-4 leading-7 text-slate-300">{dtsc.summary}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {reasons.map((reason) => (
              <div key={reason} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-bold text-white">
                <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-300" />
                {reason}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="projets" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionIntro eyebrow="Projets & démonstrations" title="Des cas d'usage visibles pour cadrer rapidement la valeur." text="Ces démonstrations aident les visiteurs et prospects à se projeter dans des solutions applicables à leur organisation." />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {projects.map((project) => (
            <article key={project.title} className="dtsc-card dtsc-card-hover p-5">
              <UploadCloud className="h-6 w-6 text-cyan-500" />
              <h3 className="mt-5 font-black text-dtsc-ink">{project.title}</h3>
              <p className="mt-3 text-sm leading-6 text-dtsc-muted">{project.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="ressources" className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionIntro eyebrow="Ressources & annonces" title="Un espace pour apprendre, suivre et décider." text="DTSC publie des contenus utiles pour comprendre la data, l'IA, les KPI et les leviers de transformation numérique." />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {resources.map((resource) => (
              <Link key={resource.href} href={resource.href} className="dtsc-card dtsc-card-hover p-5">
                <FileText className="h-6 w-6 text-dtsc-blue" />
                <h3 className="mt-5 font-black text-dtsc-ink">{resource.title}</h3>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{resource.text}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Lire la ressource
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] bg-[#002b5b] p-6 text-white shadow-[0_24px_80px_rgba(0,43,91,0.22)] sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-3xl font-black">Votre organisation est prête pour le prochain niveau numérique ?</h2>
              <p className="mt-3 max-w-3xl leading-7 text-blue-100">
                Discutons de vos besoins et construisons une solution adaptée à votre réalité.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
              <Link href="#contact">
                Contacter DTSC
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <ContactNewsletterSection contactEmail={dtsc.email} />

      <PublicFooter />
    </main>
  );
}

function SectionIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black text-dtsc-ink sm:text-4xl">{title}</h2>
      <p className="mt-4 leading-7 text-dtsc-muted">{text}</p>
    </div>
  );
}
