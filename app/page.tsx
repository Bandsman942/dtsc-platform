import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Database,
  HelpCircle,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HeroImageCarousel } from "@/components/public/hero-image-carousel";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

const gateways = [
  { title: "Services", href: "/services", text: "Conseil numérique, data, IA, applications métier, formation et optimisation.", icon: Database },
  { title: "Solutions", href: "/solutions", text: "Chatbot, dashboards, automatisation, portails clients et IA documentaire.", icon: Bot },
  { title: "Secteurs", href: "/secteurs", text: "Assurances, cliniques, pharmacies, PME, ONG, finance et administration.", icon: ShieldCheck },
  { title: "Projets", href: "/projets", text: "Démonstrations concrètes pour cadrer rapidement la valeur métier.", icon: BarChart3 },
];

const homeHeroImages = [
  "/dtsc-logo.png",
  "https://images.pexels.com/photos/36733421/pexels-photo-36733421.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/7693688/pexels-photo-7693688.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/3931865/pexels-photo-3931865.jpeg?auto=compress&cs=tinysrgb&w=1400",
];

const faqCategories = [
  {
    title: "Démarrage & accompagnement",
    description: "Comprendre comment DTSC cadre un besoin, organise une consultation et lance un projet.",
    items: [
      {
        question: "Que fait concrètement DTSC pour une entreprise ?",
        answer:
          "DTSC accompagne les organisations dans leur transformation numérique: diagnostic, automatisation des processus, tableaux de bord, applications métier, chatbot professionnel, exploitation de la data, conseil technologique, formation et amélioration de la performance.",
      },
      {
        question: "Comment se passe une première consultation ?",
        answer:
          "La première étape consiste à clarifier votre contexte, vos objectifs, vos contraintes et vos priorités. DTSC peut ensuite recommander une feuille de route, un prototype, un tableau de bord, une automatisation ou une solution complète selon le niveau de maturité de votre organisation.",
      },
      {
        question: "Faut-il déjà avoir un cahier des charges détaillé ?",
        answer:
          "Non. Vous pouvez venir avec une idée, un problème métier, un fichier Excel, un processus manuel ou un objectif de performance. DTSC aide à structurer le besoin avant de proposer une solution adaptée.",
      },
      {
        question: "Quels types d'organisations peuvent travailler avec DTSC ?",
        answer:
          "DTSC vise les PME, startups, assurances, cliniques, pharmacies, ONG, institutions, écoles, structures financières et administrations qui veulent mieux utiliser le numérique, les données et l'IA.",
      },
    ],
  },
  {
    title: "Solutions, data & IA",
    description: "Réponses sur le chatbot, les dashboards, les applications métier et la capacité documentaire.",
    items: [
      {
        question: "Le chatbot DTSC remplace-t-il un consultant humain ?",
        answer:
          "Non. Le chatbot aide à clarifier les besoins, répondre aux questions fréquentes, structurer les demandes et orienter vers l'équipe DTSC. Les décisions commerciales, techniques ou stratégiques doivent rester validées par une personne de l'équipe.",
      },
      {
        question: "Le chatbot peut-il utiliser les informations de mon entreprise ?",
        answer:
          "Oui, dans l'espace privé, l'utilisateur peut renseigner un profil entreprise, ses activités, ses responsabilités, ses objectifs et certains documents selon son abonnement. Ces informations servent à contextualiser ses échanges sans les mélanger avec les données d'autres utilisateurs.",
      },
      {
        question: "DTSC peut-il créer des tableaux de bord et KPI ?",
        answer:
          "Oui. DTSC peut concevoir des dashboards pour suivre les ventes, opérations, finances, risques, satisfaction client, activité interne ou indicateurs propres à votre secteur.",
      },
      {
        question: "Pouvez-vous automatiser des processus internes ?",
        answer:
          "Oui. DTSC peut aider à réduire les doubles saisies, structurer les relances, centraliser les demandes, automatiser des validations, connecter des formulaires et produire des rapports plus fiables.",
      },
    ],
  },
  {
    title: "Plateforme, sécurité & données",
    description: "Questions sur les comptes, les documents, la confidentialité, les limites et le support.",
    items: [
      {
        question: "Faut-il créer un compte pour utiliser le chatbot ?",
        answer:
          "Oui, les fonctionnalités privées comme l'historique, le contexte entreprise, les documents, les notifications, les tickets et les abonnements nécessitent un compte sécurisé. Les pages publiques restent accessibles sans compte.",
      },
      {
        question: "Mes documents sont-ils visibles par d'autres utilisateurs ?",
        answer:
          "Non. Les documents et le contexte entreprise sont isolés par utilisateur. Un utilisateur ne doit accéder qu'à ses propres informations, sauf cas d'administration ou de support strictement encadré.",
      },
      {
        question: "Quels sont les plans d'abonnement prévus ?",
        answer:
          "La plateforme prévoit un plan gratuit limité et des plans payants adaptés à différents niveaux d'usage. Tant que le paiement en ligne est en maintenance, le plan gratuit reste opérationnel et les plans payants sont affichés clairement comme indisponibles temporairement.",
      },
      {
        question: "Que se passe-t-il si j'atteins ma limite de messages ?",
        answer:
          "L'application affiche une information claire avec la prochaine heure de réinitialisation. L'objectif est de garder un usage maîtrisé, transparent et compatible avec le niveau d'abonnement choisi.",
      },
    ],
  },
  {
    title: "Commercial, support & évolution",
    description: "Questions sur les délais, les tickets, les formations et les prochaines intégrations.",
    items: [
      {
        question: "Comment demander une démonstration ou un devis ?",
        answer:
          "Vous pouvez passer par la page Contact, Demander un avis, utiliser le chatbot pour structurer votre besoin ou créer un ticket lorsque vous êtes connecté. DTSC revient ensuite vers vous pour cadrer la demande.",
      },
      {
        question: "Quels délais prévoir pour un projet ?",
        answer:
          "Le délai dépend du périmètre. Un cadrage ou prototype peut être rapide, alors qu'une application métier complète ou une intégration documentaire demande une phase d'analyse, de conception, de tests et d'accompagnement.",
      },
      {
        question: "DTSC propose-t-il de la formation ?",
        answer:
          "Oui. DTSC peut accompagner les équipes sur la lecture des KPI, la culture data, l'usage de tableaux de bord, l'automatisation, l'IA appliquée et l'adoption des outils mis en place.",
      },
      {
        question: "Quelles évolutions sont prévues pour la plateforme ?",
        answer:
          "La roadmap inclut l'amélioration du RAG documentaire, les intégrations métier, les exports, le support avancé, les paiements, les communications clients et les canaux comme WhatsApp Business selon les priorités de production.",
      },
    ],
  },
];

const faqItems = faqCategories.flatMap((category) => category.items);
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function Page() {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <PublicHeader />

      <section className="relative overflow-hidden bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#0057b8] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,194,255,0.24),transparent_32%),radial-gradient(circle_at_82%_6%,rgba(255,255,255,0.16),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="animate-slide-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-cyan-200">
              <Sparkles className="h-4 w-4" />
              {dtsc.slogan}
            </p>
            <h1 className="dtsc-hero-heading mt-6 max-w-5xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Accélérez votre transformation numérique avec la data, l&apos;IA et des solutions technologiques sur mesure.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-cyan-50">
              DTSC accompagne les entreprises dans la conception, l&apos;automatisation et le déploiement de solutions digitales orientées performance.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] shadow-[0_16px_40px_rgba(0,194,255,0.2)] hover:bg-cyan-300">
                <Link href="/contact">
                  Demander un avis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15">
                <Link href="/services">Découvrir nos services</Link>
              </Button>
            </div>
            <div className="mt-10 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-3">
              {[dtsc.vision, dtsc.mission, dtsc.businessModel].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-bold leading-6 text-blue-50">
                  <CheckCircle2 className="mb-3 h-5 w-5 text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-cyan-300/20 blur-2xl transition duration-500 group-hover:scale-105" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <HeroImageCarousel images={homeHeroImages} label="Data and Tech Solutions Consulting" eyebrow="Kinshasa · Afrique" className="h-80" priority />
              <div className="grid gap-3 p-5 sm:grid-cols-3">
                {["Data", "IA", "Business"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-black text-white">
                    <BrainCircuit className="mb-3 h-5 w-5 text-cyan-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/ressources"
            className="group grid gap-4 overflow-hidden rounded-3xl border border-dtsc-border bg-[linear-gradient(120deg,var(--dtsc-soft),var(--dtsc-surface),var(--dtsc-page))] p-5 shadow-[0_18px_55px_rgba(0,43,91,0.08)] transition hover:-translate-y-0.5 hover:border-cyan-400 md:grid-cols-[1fr_auto]"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400 text-[#001736] shadow-[0_14px_34px_rgba(0,194,255,0.22)]">
                <HelpCircle className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Ressources DTSC</p>
                <h2 className="mt-1 text-2xl font-black text-dtsc-ink">Lisez nos guides, annonces, cas pratiques et articles pour mieux préparer vos projets.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
                  Accédez à des contenus utiles sur la data, l&apos;IA, l&apos;automatisation, les dashboards et la transformation numérique avant de passer à l&apos;échange avec l&apos;équipe DTSC.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#002b5b] px-5 py-3 text-sm font-black text-white transition group-hover:bg-[#001736]">
              Lire nos ressources
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </section>

      <section className="dtsc-public-band-light border-b border-dtsc-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Explorer DTSC</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">
              Découvrez nos <span className="text-dtsc-blue">expertises</span> à travers des pages dédiées.
            </h2>
            <p className="mt-4 leading-7 text-dtsc-muted">
              Retrouvez en un coup d&apos;œil nos services, solutions, secteurs d&apos;intervention et projets. Chaque rubrique vous présente clairement notre approche, nos expertises et la valeur que nous apportons aux organisations.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {gateways.map((item, index) => (
              <Link key={item.href} href={item.href} className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover p-6`}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{item.text}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  En savoir plus
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-dtsc-border dtsc-public-band-cyan">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="rounded-[1.5rem] bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.18)] sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Pourquoi DTSC ?</p>
            <h2 className="mt-3 text-3xl font-black">
              Une expertise hybride entre <span className="text-cyan-300">santé</span>, data et technologie.
            </h2>
            <p className="mt-4 leading-7 text-slate-300">
              DTSC accompagne les organisations dans leur transformation numérique en combinant expertise métier, analyse des données, automatisation et solutions technologiques adaptées aux réalités du terrain.
            </p>
          </div>
          <div className="grid gap-3">
            {dtsc.advantages.map((advantage) => (
              <div key={advantage} className="dtsc-card-alt flex items-center gap-3 p-4 text-sm font-bold text-dtsc-ink">
                <CheckCircle2 className="h-5 w-5 text-cyan-500" />
                {advantage}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-dtsc-border dtsc-public-band-soft">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(0,194,255,0.14),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(0,87,184,0.12),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <p className="inline-flex items-center gap-2 rounded-full bg-dtsc-soft px-3 py-1.5 text-sm font-black text-dtsc-blue">
                <HelpCircle className="h-4 w-4" />
                Questions fréquentes
              </p>
              <h2 className="mt-5 max-w-2xl text-3xl font-black leading-tight text-dtsc-ink sm:text-5xl">
                Tout ce qu&apos;un client veut clarifier avant de démarrer avec DTSC.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-dtsc-muted">
                Une FAQ structurée pour comprendre les services, la plateforme, la confidentialité, les abonnements et l&apos;accompagnement DTSC avant de Demander un avis.
              </p>
              <div className="mt-7 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-[0_18px_60px_rgba(0,43,91,0.08)]">
                <div className="flex items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-bold text-dtsc-muted">
                  <MessageCircleQuestion className="h-5 w-5 text-cyan-500" />
                  Parcourez les catégories ou contactez DTSC si votre besoin est spécifique.
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {faqCategories.map((category) => (
                    <a
                      key={category.title}
                      href={`#faq-${category.title.toLowerCase().replaceAll(" ", "-").replaceAll("&", "et")}`}
                      className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-black text-dtsc-blue underline-offset-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-500 hover:underline"
                    >
                      {category.title}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {faqCategories.map((category) => (
                <article
                  key={category.title}
                  id={`faq-${category.title.toLowerCase().replaceAll(" ", "-").replaceAll("&", "et")}`}
                  className="overflow-hidden rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface shadow-[0_20px_70px_rgba(0,43,91,0.08)]"
                >
                  <div className="border-b border-dtsc-border bg-dtsc-soft p-5 sm:p-6">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-blue">{category.title}</p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{category.description}</p>
                  </div>
                  <Accordion>
                    {category.items.map((item) => (
                      <AccordionItem key={item.question} title={item.question}>
                        {item.answer}
                      </AccordionItem>
                    ))}
                  </Accordion>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="dtsc-public-band-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] bg-[#002b5b] p-6 text-white shadow-[0_24px_80px_rgba(0,43,91,0.22)] sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-3xl font-black">Passez à une nouvelle étape de votre transformation numérique.</h2>
              <p className="mt-3 max-w-3xl leading-7 text-blue-100">
                Échangeons sur vos besoins et construisons ensemble une solution adaptée à vos objectifs, à vos équipes et à votre réalité opérationnelle.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300">
              <Link href="/contact">
                Contacter DTSC
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
