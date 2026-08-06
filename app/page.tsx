import Link from "next/link";
import { ArrowRight, BarChart3, Bot, BrainCircuit, ClipboardCheck, Database, FileText, GraduationCap, Layers3, Megaphone, Network, ShieldCheck, Sparkles, Target, Workflow } from "lucide-react";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { LazyPublicAgent } from "@/components/public/lazy-public-agent";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { getDashboardUrl } from "@/lib/domains";

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

const sectors = ["PME et services professionnels", "Cliniques et structures de santé", "Pharmacies et distribution", "Assurances et finance", "ONG et institutions", "Éducation et formation"];

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
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div className="absolute -right-24 top-16 h-80 w-80 rounded-full border border-cyan-300/35" /><div className="absolute right-20 top-32 h-px w-[38rem] rotate-[-18deg] bg-cyan-300/30" /><div className="absolute bottom-[-13rem] left-[42%] h-96 w-96 rounded-full border border-blue-200/35" /></div>
        <div className="relative mx-auto grid max-w-[92rem] items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-28">
          <div>
            <p className="dtsc-label inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-dtsc-blue"><Sparkles className="h-4 w-4" /> Conseil · Technologie · Data · IA</p>
            <h1 className="dtsc-display mt-7 max-w-5xl text-dtsc-ink">Sept leviers numériques pour une performance plus claire.</h1>
            <p className="dtsc-body-lg mt-7 max-w-2xl text-dtsc-muted">DTSC aide les organisations à améliorer leur performance grâce à sept leviers complémentaires, depuis le diagnostic jusqu’à la mesure des résultats.</p>
            <div className="mt-9 flex flex-wrap gap-3"><Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-dtsc-blue px-5 py-3 font-semibold text-white shadow-[var(--dtsc-shadow-md)] transition hover:bg-[var(--dtsc-brand-secondary-hover)]">Demander une consultation <ArrowRight className="h-4 w-4" /></Link><Link href="/services" className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-5 py-3 font-semibold text-dtsc-blue transition hover:bg-dtsc-soft">Découvrir les 7 leviers</Link><Link href={dashboardUrl} className="inline-flex items-center gap-2 px-2 py-3 font-semibold text-dtsc-muted hover:text-dtsc-blue">Accéder à la plateforme</Link></div>
            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3"><div className="border-l-2 border-cyan-400 pl-4"><p className="text-sm font-semibold text-dtsc-ink">Cadrage réel</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Pas de solution avant de comprendre le besoin.</p></div><div className="border-l-2 border-blue-500 pl-4"><p className="text-sm font-semibold text-dtsc-ink">Livraison progressive</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Des résultats testables plutôt qu’un effet vitrine.</p></div><div className="border-l-2 border-emerald-500 pl-4"><p className="text-sm font-semibold text-dtsc-ink">Mesure continue</p><p className="mt-1 text-xs leading-5 text-dtsc-muted">Des indicateurs reliés aux décisions.</p></div></div>
          </div>
          <div className="dtsc-product-surface relative overflow-hidden p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4"><div><p className="dtsc-label text-dtsc-blue">Écosystème DTSC</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Une méthode, plusieurs points d’entrée</h2></div><Workflow className="h-9 w-9 text-cyan-500" /></div>
            <div className="mt-8 grid gap-3">{levers.map((lever, index) => { const Icon = lever.icon; return <Link key={lever.title} href={lever.href} className="group flex items-center gap-4 rounded-xl border border-dtsc-border bg-dtsc-page p-3 transition hover:border-cyan-300 hover:bg-dtsc-soft"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dtsc-surface text-dtsc-blue shadow-sm"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="text-xs font-bold text-dtsc-muted">0{index + 1}</span><span className="ml-2 font-semibold text-dtsc-ink">{lever.title}</span></span><ArrowRight className="h-4 w-4 text-dtsc-muted transition group-hover:translate-x-0.5 group-hover:text-dtsc-blue" /></Link>; })}</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"><div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]"><div><p className="dtsc-label text-dtsc-blue">Problèmes clients</p><h2 className="dtsc-h2 mt-4">Le numérique doit résoudre un problème, pas en créer un nouveau.</h2><p className="mt-5 leading-7 text-dtsc-muted">DTSC relie chaque besoin au levier principal, puis ajoute uniquement les capacités complémentaires nécessaires.</p></div><div className="divide-y divide-dtsc-border border-y border-dtsc-border">{problems.map(([title, answer]) => <div key={title} className="grid gap-2 py-5 sm:grid-cols-[1fr_1fr]"><h3 className="font-semibold text-dtsc-ink">{title}</h3><p className="text-sm leading-6 text-dtsc-muted">{answer}</p></div>)}</div></div></section>

      <section className="border-y border-dtsc-border bg-dtsc-surface"><div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"><div className="max-w-3xl"><p className="dtsc-label text-dtsc-blue">Les sept leviers</p><h2 className="dtsc-h2 mt-4">Une offre lisible, sans huitième service inventé.</h2><p className="mt-5 leading-7 text-dtsc-muted">Les dashboards, chatbots, ERP, applications et campagnes sont des réalisations rattachées à ces leviers.</p></div><div className="mt-10 grid gap-px overflow-hidden rounded-[var(--dtsc-panel-radius)] border border-dtsc-border bg-dtsc-border md:grid-cols-2 xl:grid-cols-3">{levers.map((lever) => { const Icon = lever.icon; return <Link key={lever.title} href={lever.href} className="group bg-dtsc-surface p-6 transition hover:bg-dtsc-soft"><Icon className="h-6 w-6 text-dtsc-blue" /><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-dtsc-ink">{lever.title}</h3><p className="mt-3 text-sm leading-6 text-dtsc-muted">{lever.description}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-dtsc-blue">Explorer <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span></Link>; })}<Link href="/services" className="flex min-h-64 flex-col justify-between bg-[var(--dtsc-brand-primary)] p-6 text-white"><Target className="h-7 w-7 text-cyan-300" /><div><p className="text-xl font-semibold">Trouver le bon point de départ</p><p className="mt-3 text-sm leading-6 text-slate-200">Comparez les besoins, leviers complémentaires et premiers livrables possibles.</p></div></Link></div></div></section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"><div className="grid gap-12 lg:grid-cols-2"><div><p className="dtsc-label text-dtsc-blue">Secteurs</p><h2 className="dtsc-h2 mt-4">Adapter les leviers aux réalités de chaque organisation.</h2><div className="mt-8 grid gap-3 sm:grid-cols-2">{sectors.map((sector) => <Link key={sector} href="/secteurs" className="flex items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-4 font-semibold text-dtsc-ink transition hover:bg-dtsc-soft"><ShieldCheck className="h-5 w-5 text-dtsc-blue" />{sector}</Link>)}</div></div><div><p className="dtsc-label text-dtsc-blue">Méthode DTSC</p><div className="mt-4 divide-y divide-dtsc-border border-y border-dtsc-border">{methodology.map((item) => <div key={item.step} className="grid gap-3 py-5 sm:grid-cols-[3rem_1fr]"><span className="text-sm font-bold text-dtsc-blue">{item.step}</span><div><h3 className="text-lg font-semibold text-dtsc-ink">{item.title}</h3><p className="mt-2 text-sm leading-6 text-dtsc-muted">{item.text}</p></div></div>)}</div></div></div></section>

      <section className="border-y border-dtsc-border bg-[var(--dtsc-brand-primary)] text-white"><div className="mx-auto grid max-w-[92rem] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8 lg:py-20"><div><p className="dtsc-label text-cyan-300">DTSC Platform</p><h2 className="dtsc-h2 mt-4 max-w-4xl text-white">Les services financent la transformation. La plateforme consolide le travail quotidien.</h2><p className="mt-5 max-w-3xl leading-7 text-slate-200">Collaboration, projets, opérations, support, ERP, data et assistants IA se rejoignent progressivement dans un écosystème multisous-domaines sécurisé.</p></div><Link href={dashboardUrl} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-[#001736]">Accéder à la plateforme <ArrowRight className="h-4 w-4" /></Link></div></section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]"><div><p className="dtsc-label text-dtsc-blue">Ressources</p><h2 className="dtsc-h2 mt-4">Apprendre avant d’investir.</h2><p className="mt-5 leading-7 text-dtsc-muted">Consultez les publications réellement disponibles, les guides et les analyses DTSC. Aucun cas client ou résultat n’est présenté sans preuve autorisée.</p><Link href="/ressources" className="mt-7 inline-flex items-center gap-2 font-semibold text-dtsc-blue">Voir les ressources publiées <ArrowRight className="h-4 w-4" /></Link></div><div className="grid gap-4 sm:grid-cols-3"><div className="dtsc-product-surface p-5"><BarChart3 className="h-6 w-6 text-dtsc-blue" /><h3 className="mt-4 font-semibold">Data & KPI</h3><p className="mt-2 text-sm leading-6 text-dtsc-muted">Comprendre les indicateurs utiles et leurs limites.</p></div><div className="dtsc-product-surface p-5"><Bot className="h-6 w-6 text-dtsc-blue" /><h3 className="mt-4 font-semibold">IA appliquée</h3><p className="mt-2 text-sm leading-6 text-dtsc-muted">Identifier les usages responsables et mesurables.</p></div><div className="dtsc-product-surface p-5"><Megaphone className="h-6 w-6 text-dtsc-blue" /><h3 className="mt-4 font-semibold">Croissance digitale</h3><p className="mt-2 text-sm leading-6 text-dtsc-muted">Relier contenu, acquisition et supports commerciaux.</p></div></div></div></section>

      <section className="border-t border-dtsc-border bg-dtsc-surface"><div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8"><div className="mb-8 max-w-3xl"><p className="dtsc-label text-dtsc-blue">Passer à l’action</p><h2 className="dtsc-h2 mt-4">Commençons par clarifier le résultat attendu.</h2></div><ContactNewsletterSection /></div></section>
      <PublicFooter />
      <LazyPublicAgent />
    </main>
  );
}
