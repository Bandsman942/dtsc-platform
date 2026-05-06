import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  LockKeyhole,
  MailCheck,
  Megaphone,
  Network,
  Printer,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { ContactNewsletterSection } from "@/components/public/contact-newsletter-section";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

const serviceIcons = [Database, BrainCircuit, ShieldCheck, Network, Bot, Megaphone, Printer];

export default function Page() {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_20%,rgba(0,194,255,0.18),transparent_34%),linear-gradient(135deg,rgba(0,23,54,0.08),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-1.5 text-sm font-bold text-dtsc-blue shadow-[0_10px_30px_rgba(0,43,91,0.08)]">
              <Sparkles className="h-4 w-4 text-cyan-500" />
              {dtsc.slogan}
            </p>
            <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight text-dtsc-ink sm:text-6xl">
              Performance digitale, data et IA pour les entreprises africaines.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-dtsc-muted">
              {dtsc.summary} Notre assistant IA qualifie les besoins, structure les échanges et oriente les clients vers un cadrage DTSC lorsque la demande devient stratégique.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-[#002b5b] text-white shadow-[0_16px_40px_rgba(0,43,91,0.2)] hover:bg-[#001736]">
                <Link href="/auth/sign-up">
                  Démarrer avec DTSC
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                <Link href="#contact">Demander une démo</Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-3 border-t border-dtsc-border pt-8 text-sm text-dtsc-muted sm:grid-cols-3">
              {dtsc.targets.map((target) => (
                <div key={target} className="flex items-center gap-2 rounded-xl bg-dtsc-surface px-3 py-2 shadow-[0_8px_24px_rgba(0,43,91,0.05)]">
                  <Building2 className="h-4 w-4 text-cyan-500" />
                  {target}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-300/30 via-blue-500/10 to-emerald-300/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface shadow-[0_24px_80px_rgba(0,23,54,0.16)]">
              <Image src="/dtsc-logo.png" alt="Identité DTSC" width={1536} height={864} className="h-56 w-full object-cover sm:h-72" priority />
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {[
                  ["Vision", dtsc.vision],
                  ["Mission", dtsc.mission],
                  ["Marché", "Assurances, cliniques, pharmacies et PME à fort besoin de digitalisation."],
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

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: BrainCircuit, title: "Conseil IA responsable", text: "Le chatbot qualifie, explique et recommande une validation humaine pour les décisions commerciales ou stratégiques." },
            { icon: Database, title: "Culture data & BI", text: "DTSC structure les KPI, les dashboards et le reporting pour transformer les données en décisions." },
            { icon: Network, title: "Plateforme SaaS évolutive", text: "Un espace structuré pour le chatbot, les documents, les tickets, les notifications et le suivi client." },
          ].map((item) => (
            <div key={item.title} className="dtsc-card dtsc-card-hover p-6">
              <item.icon className="h-6 w-6 text-dtsc-blue" />
              <h2 className="mt-5 text-lg font-bold text-dtsc-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-bold text-cyan-600">Plateforme DTSC</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Un espace client SaaS pour piloter les échanges IA, les documents et la relation DTSC.</h2>
          </div>
          <Button asChild variant="outline" className="w-fit rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
            <Link href="/auth/sign-up">
              Essayer le plan Découverte
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: LockKeyhole,
              title: "Comptes sécurisés",
              text: "Inscription avec OTP email, sessions privées, rôles ADMIN, MANAGER, SUPPORT et CLIENT.",
              href: "/auth/sign-up",
              label: "Créer un compte",
            },
            {
              icon: CreditCard,
              title: "Plans chatbot",
              text: "Découverte gratuit, puis offres Essentiel, Professionnel et Entreprise selon le volume de messages et documents.",
              href: "/billing",
              label: "Voir les plans",
            },
            {
              icon: FileText,
              title: "Base documentaire",
              text: "Ajoutez vos documents utiles pour aider le chatbot à mieux comprendre votre contexte métier.",
              href: "/documents",
              label: "Préparer les documents",
            },
            {
              icon: ReceiptText,
              title: "Factures et suivi",
              text: "Suivez vos abonnements, recevez vos factures par email et gardez une vision claire de votre accès.",
              href: "/billing",
              label: "Comprendre la facturation",
            },
          ].map((item) => (
            <article key={item.title} className="group dtsc-card dtsc-card-hover flex min-h-72 flex-col p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-500 transition group-hover:bg-cyan-400 group-hover:text-[#001736]">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-dtsc-muted">{item.text}</p>
              <Link href={item.href} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
                {item.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="rounded-[1.5rem] border border-cyan-300/30 bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.18)] sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full bg-cyan-300/10 px-3 py-1.5 text-sm font-black text-cyan-200">
              <UploadCloud className="h-4 w-4" />
              Assistance documentaire
            </p>
            <h2 className="mt-5 text-3xl font-black">Le chatbot peut exploiter vos documents métier dans un espace privé.</h2>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">
              Ajoutez vos fichiers importants pour obtenir des réponses plus adaptées à votre activité. Vos contenus restent organisés dans votre espace et servent uniquement à améliorer vos échanges avec le chatbot DTSC.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["PDF acceptés", "Espace privé", "Réponses plus utiles"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-bold text-white">
                  <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4">
            {[
              {
                icon: MailCheck,
                title: "Communications utiles",
                text: "Codes de vérification, factures, notifications et messages importants sont envoyés de manière claire et professionnelle.",
              },
              {
                icon: ShieldCheck,
                title: "Abonnements payants en préparation",
                text: "Le plan gratuit reste disponible. Les offres payantes seront ouvertes dès que le paiement en ligne sera finalisé.",
              },
              {
                icon: Bot,
                title: "Chatbot DTSC contextualisé",
                text: "L'assistant connaît les services DTSC et oriente les demandes vers les bons modules: chatbot, documents, support, annonces ou contact.",
              },
            ].map((item) => (
              <article key={item.title} className="dtsc-card flex gap-4 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-dtsc-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-dtsc-muted">{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-bold text-cyan-600">Offre DTSC</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Services principaux</h2>
            <p className="mt-3 leading-7 text-dtsc-muted">
              Une offre hybride combinant consulting, abonnements, développement, marketing, formation et produits digitaux.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dtsc.services.map((service, index) => {
              const Icon = serviceIcons[index] || CheckCircle2;
              return (
                <div key={service} className="dtsc-card dtsc-card-hover flex items-start gap-3 p-4 text-sm font-semibold text-dtsc-ink">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-500" />
                  {service}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.18)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(0,194,255,0.28),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_60%)]" />
            <div className="relative">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">Méthode DTSC</p>
              <h2 className="mt-3 text-3xl font-black">De la vision business au produit numérique mesurable.</h2>
              <p className="mt-4 max-w-xl leading-7 text-slate-300">
                DTSC combine diagnostic, priorisation, prototype, déploiement et accompagnement. Chaque chantier doit relier une technologie à un indicateur de performance: coût, délai, qualité de service, visibilité ou chiffre d&apos;affaires.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {["Diagnostic stratégique", "Architecture data", "Automatisation métier", "Formation et adoption"].map((item) => (
                  <div key={item} className="rounded-2xl bg-white/10 p-4 text-sm font-bold text-white transition hover:bg-white/15">
                    <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {[
              ["01", "Cadrer", "Identifier les décisions critiques, les données disponibles, les irritants opérationnels et les gains rapides."],
              ["02", "Construire", "Mettre en place des dashboards, applications, automatisations ou assistants IA avec une architecture évolutive."],
              ["03", "Mesurer", "Suivre les KPI, les usages, les tickets, les limites IA et les retours utilisateurs pour améliorer la plateforme."],
            ].map(([step, title, text]) => (
              <div key={step} className="dtsc-card group flex gap-4 p-5 transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_18px_50px_rgba(0,43,91,0.12)]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-dtsc-soft text-lg font-black text-dtsc-blue">{step}</div>
                <div>
                  <h3 className="text-lg font-black text-dtsc-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-dtsc-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.22)] sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-sm font-bold text-cyan-300">Impact attendu</p>
              <h2 className="mt-2 text-3xl font-black">Un cockpit de performance pour vos équipes.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dtsc.advantages.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm font-semibold">
                  <BarChart3 className="h-4 w-4 text-cyan-300" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-black text-dtsc-ink">FAQ</h2>
        <div className="mt-6 divide-y divide-dtsc-border rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-[0_12px_40px_rgba(0,43,91,0.06)]">
          {[
            ["Le chatbot remplace-t-il l'équipe DTSC ?", "Non. Il accélère la qualification et recommande une validation humaine pour les demandes commerciales, stratégiques ou complexes."],
            ["Quels secteurs DTSC cible-t-il ?", "Les assurances, cliniques, pharmacies et PME, avec une approche adaptée à la réalité de Kinshasa et du marché africain."],
            ["Comment contacter DTSC ?", `WhatsApp: ${dtsc.whatsapp}. Réseaux sociaux: ${dtsc.socialHandle}.`],
          ].map(([question, answer]) => (
            <div key={question} className="p-5">
              <h3 className="font-bold text-dtsc-ink">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <ContactNewsletterSection contactEmail={dtsc.email} />

      <PublicFooter />
    </main>
  );
}
