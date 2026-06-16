import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  HelpCircle,
  Layers3,
  Megaphone,
  MessageCircleQuestion,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HeroImageCarousel } from "@/components/public/hero-image-carousel";
import { DtscAgentWidget } from "@/components/public/dtsc-agent-widget";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { PublicPWAInstallCard } from "@/components/pwa/public-pwa-install-card";
import { Button } from "@/components/ui/button";
import { dtsc } from "@/lib/dtsc";

const gateways = [
  { title: "Services", href: "/services", text: "Les 7 leviers numériques officiels qui structurent toute l'offre DTSC.", icon: Database },
  { title: "Solutions", href: "/solutions", text: "Des exemples concrets rattachés aux leviers Data & BI, IA et Solutions digitales.", icon: Bot },
  { title: "Secteurs", href: "/secteurs", text: "Les 7 leviers adaptés aux réalités des assurances, cliniques, PME et institutions.", icon: ShieldCheck },
  { title: "Projets", href: "/projets", text: "Des cas d'application pour tester rapidement la valeur d'un levier numérique.", icon: BarChart3 },
];

const homeHeroImages = [
  "/dtsc-logo.png",
  "https://images.pexels.com/photos/36733421/pexels-photo-36733421.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/7693688/pexels-photo-7693688.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/3931865/pexels-photo-3931865.jpeg?auto=compress&cs=tinysrgb&w=1400",
];

const leverCards = [
  { title: "Data & BI", text: "Piloter avec des KPI fiables, des dashboards utiles et un reporting compréhensible.", icon: Database },
  { title: "Intelligence artificielle", text: "Gagner du temps avec chatbot, assistant documentaire et automatisation intelligente.", icon: BrainCircuit },
  { title: "Solutions digitales", text: "Centraliser les processus avec applications web, ERP, CRM, portails et workflows.", icon: Layers3 },
  { title: "Audit & optimisation", text: "Repérer pertes, coûts, anomalies et blocages pour prioriser les améliorations.", icon: ClipboardCheck },
  { title: "Formations", text: "Rendre les équipes autonomes sur data, IA, KPI et adoption des outils.", icon: GraduationCap },
  { title: "Marketing digital", text: "Structurer visibilité, acquisition, branding, contenus et campagnes.", icon: Network },
  { title: "Imprimerie numérique", text: "Produire flyers, brochures, cartes et supports commerciaux professionnels.", icon: FileText },
];

const problemCards = [
  { title: "Je veux mieux piloter mon activité", levers: "Data & BI + Audit & optimisation", href: "/bi-kpi" },
  { title: "Je veux automatiser mes processus", levers: "Intelligence artificielle + Solutions digitales", href: "/solutions" },
  { title: "Je veux attirer plus de clients", levers: "Marketing digital + Imprimerie numérique", href: "/services" },
  { title: "Je veux former mon équipe", levers: "Formations + Data & BI + IA", href: "/ressources" },
  { title: "Je veux réduire mes pertes", levers: "Audit & optimisation + Data & BI", href: "/services" },
  { title: "Je veux créer un outil digital", levers: "Solutions digitales", href: "/solutions" },
  { title: "Je veux améliorer mes supports", levers: "Imprimerie numérique + Marketing digital", href: "/contact" },
];

const useCaseCards = [
  { title: "Dashboard exécutif", text: "Une vue synthétique pour direction, finances, opérations ou ventes.", href: "/bi-kpi" },
  { title: "Chatbot client", text: "Un assistant pour qualifier, orienter et escalader les demandes utiles.", href: "/ia-entreprise" },
  { title: "Application de gestion interne", text: "Un outil digital pour centraliser formulaires, validations et suivi.", href: "/solutions" },
  { title: "Campagne digitale", text: "Des contenus, visuels et CTA pour gagner en visibilité.", href: "/services" },
  { title: "Audit des processus", text: "Une analyse des pertes, retards, coûts et points de friction.", href: "/projets" },
  { title: "Formation équipe", text: "Un atelier pratique pour lire les KPI, comprendre l'IA ou adopter un outil.", href: "/ressources" },
  { title: "Kit de supports imprimés", text: "Flyers, brochures, cartes et supports commerciaux cohérents.", href: "/contact" },
];

const faqCategories = [
  {
    title: "Démarrage & accompagnement",
    description: "Comprendre comment DTSC cadre un besoin, organise une consultation et lance un projet.",
    items: [
      {
        question: "Que fait concrètement DTSC pour une entreprise ?",
        answer:
          "DTSC aide les organisations à booster leur performance avec 7 leviers numériques: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique. Les dashboards, chatbots, ERP, CRM ou portails clients sont des exemples rattachés à ces leviers, pas des services séparés.",
      },
      {
        question: "Comment se passe une première consultation ?",
        answer:
          "La première étape consiste à clarifier votre contexte, vos objectifs, vos contraintes et vos priorités. DTSC identifie ensuite les leviers les plus utiles et peut proposer une feuille de route, un prototype ou un accompagnement progressif.",
      },
      {
        question: "Puis-je échanger avec l'assistant IA public avant de contacter DTSC ?",
        answer:
          "Oui. L'assistant IA public de DTSC peut répondre aux questions liées aux 7 leviers DTSC, aider à préciser un besoin et transmettre une demande commerciale à l'équipe après confirmation. Il reste limité au périmètre DTSC et ne doit pas répondre aux sujets hors contexte.",
      },
      {
        question: "Faut-il déjà avoir un cahier des charges détaillé ?",
        answer:
          "Non. Vous pouvez venir avec une idée, un problème métier, un fichier Excel, un processus manuel ou un objectif de performance. DTSC aide à structurer le besoin avant de proposer une solution adaptée.",
      },
      {
        question: "Quels types d'organisations peuvent travailler avec DTSC ?",
        answer:
          "DTSC vise les PME, startups, assurances, cliniques, pharmacies, ONG, institutions, écoles, structures financières et administrations qui veulent appliquer les 7 leviers numériques à leur performance réelle.",
      },
      {
        question: "Quel levier choisir en premier ?",
        answer:
          "Le premier levier dépend du problème le plus urgent. Data & BI aide si vos chiffres sont dispersés, l'IA si les tâches répétitives bloquent les équipes, les Solutions digitales si un processus manuel doit être centralisé, et l'Audit & optimisation si les pertes ne sont pas encore visibles.",
      },
      {
        question: "DTSC travaille-t-il avec des PME ?",
        answer:
          "Oui. Les PME font partie des cibles prioritaires de DTSC, avec des formats progressifs: diagnostic, dashboard, campagne, formation, prototype ou kit de supports professionnels.",
      },
      {
        question: "Peut-on commencer avec un petit budget ?",
        answer:
          "Oui, lorsque le besoin est bien cadré. DTSC peut recommander un premier livrable limité pour tester la valeur avant d'élargir le projet.",
      },
      {
        question: "Combien de temps prend un projet ?",
        answer:
          "Le délai dépend du périmètre, des données disponibles et des validations. Un audit ou prototype peut démarrer plus vite qu'une solution complète; DTSC précise le délai après cadrage.",
      },
      {
        question: "Les formations sont-elles adaptées aux non-techniciens ?",
        answer:
          "Oui. Les formations DTSC peuvent être conçues pour des dirigeants, managers et équipes opérationnelles qui veulent comprendre les KPI, la data, l'IA ou l'adoption des outils sans jargon inutile.",
      },
    ],
  },
  {
    title: "Solutions, data & IA",
    description: "Réponses sur les exemples rattachés aux leviers Data & BI, Intelligence artificielle et Solutions digitales.",
    items: [
      {
        question: "Le chatbot DTSC remplace-t-il un consultant humain ?",
        answer:
          "Non. Le chatbot aide à clarifier les besoins, répondre aux questions fréquentes, structurer les demandes et orienter vers l'équipe DTSC. Les décisions commerciales, techniques ou stratégiques doivent rester validées par une personne de l'équipe.",
      },
      {
        question: "L'assistant IA public peut-il inventer des guides ou articles DTSC ?",
        answer:
          "Non. L'assistant public doit s'appuyer uniquement sur les informations DTSC disponibles et sur les publications réellement publiées. Si une ressource n'existe pas, il doit orienter vers la page Ressources, la FAQ ou l'inscription newsletter plutôt que créer un titre fictif.",
      },
      {
        question: "Le chatbot peut-il utiliser les informations de mon entreprise ?",
        answer:
          "Oui, dans l'espace privé, l'utilisateur peut renseigner un profil entreprise, ses activités, ses responsabilités, ses objectifs et certains documents selon son abonnement. Ces informations servent à contextualiser ses échanges sans les mélanger avec les données d'autres utilisateurs.",
      },
      {
        question: "DTSC peut-il créer des tableaux de bord et KPI ?",
        answer:
          "Oui. Les dashboards, KPI, reporting et tableaux de bord sont des exemples du levier Data & BI. Ils peuvent suivre ventes, opérations, finances, risques, satisfaction client, activité interne ou indicateurs propres à votre secteur.",
      },
      {
        question: "Pouvez-vous automatiser des processus internes ?",
        answer:
          "Oui, quand cela sert un objectif mesurable. Selon le contexte, l'automatisation peut relever du levier Intelligence artificielle ou du levier Solutions digitales, par exemple pour réduire les doubles saisies, structurer les relances ou produire des rapports plus fiables.",
      },
      {
        question: "Le chatbot privé peut-il envoyer un message à DTSC ?",
        answer:
          "Oui. Dans l'espace privé, le chatbot peut aider à préparer un message avec un objet, un contexte et une description claire, puis l'envoyer à DTSC uniquement après confirmation explicite de l'utilisateur.",
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
        question: "Comment DTSC protège-t-il les données envoyées via l'assistant ou le chatbot ?",
        answer:
          "Les clés API restent côté serveur, les conversations privées sont rattachées au compte connecté, les actions sensibles demandent confirmation et les données prospects ou tickets sont traitées selon les règles de confidentialité de la plateforme.",
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
          "Vous pouvez passer par la page Contact, utiliser le chatbot pour structurer votre besoin ou créer un ticket lorsque vous êtes connecté. DTSC revient ensuite vers vous pour cadrer la demande.",
      },
      {
        question: "Puis-je créer un ticket support depuis le chatbot privé ?",
        answer:
          "Oui. Le chatbot privé peut collecter l'objet, la description et la priorité du problème, puis créer un ticket support après confirmation explicite. Le ticket reste ensuite visible dans le module Support.",
      },
      {
        question: "Quels délais prévoir pour un projet ?",
        answer:
          "Le délai dépend du périmètre et du levier retenu. Un cadrage ou prototype peut être rapide, alors qu'un cas d'application plus complet demande une phase d'analyse, de conception, de tests et d'accompagnement.",
      },
      {
        question: "DTSC propose-t-il de la formation ?",
        answer:
          "Oui. Les Formations font partie des 7 leviers officiels DTSC: culture data, IA, lecture des KPI, adoption des outils numériques et montée en compétence des équipes.",
      },
      {
        question: "Quelles évolutions sont prévues pour la plateforme ?",
        answer:
          "La roadmap améliore les cas d'application des 7 leviers, notamment l'IA documentaire, les intégrations utiles, les exports, le support avancé, les paiements et les communications clients selon les priorités de production.",
      },
      {
        question: "Qui peut rédiger des publications publiques DTSC ?",
        answer:
          "Les administrateurs peuvent publier ou supprimer les contenus publics. Selon les paramètres globaux, certains utilisateurs non-client peuvent aussi préparer des brouillons sous leur nom, mais seul un administrateur peut les publier.",
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
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <PublicHeader />

      <section className="relative overflow-hidden bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#0057b8] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,194,255,0.24),transparent_32%),radial-gradient(circle_at_82%_6%,rgba(255,255,255,0.16),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl min-w-0 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="dtsc-premium-reveal min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-cyan-200">
              <Sparkles className="h-4 w-4" />
              {dtsc.slogan}
            </p>
            <h1 className="dtsc-hero-heading dtsc-text-shimmer mt-6 max-w-5xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Boostez votre performance avec les 7 leviers numériques DTSC.
            </h1>
            <p className="dtsc-premium-reveal-delay mt-6 max-w-3xl text-lg leading-8 text-cyan-50">
              DTSC accompagne les entreprises avec Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-xl bg-cyan-400 text-[#001736] shadow-[0_16px_40px_rgba(0,194,255,0.2)] hover:bg-cyan-300">
                <Link href="/contact">
                  Demander une consultation
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15">
                <Link href="/services">Découvrir les 7 leviers</Link>
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

          <div className="group relative min-w-0 max-w-full overflow-hidden rounded-[2rem]">
            <div className="absolute -inset-5 rounded-[2rem] bg-cyan-300/20 blur-2xl transition duration-500 group-hover:scale-105" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <HeroImageCarousel images={homeHeroImages} label="Data and Tech Solutions Consulting" eyebrow="Kinshasa · Afrique" className="h-80" priority />
              <div className="grid min-w-0 gap-3 p-5 sm:grid-cols-3">
                {["Data & BI", "IA", "Solutions"].map((item) => (
                  <div key={item} className="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm font-black text-white">
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
            className="group grid min-w-0 gap-4 overflow-hidden rounded-3xl border border-dtsc-border bg-[linear-gradient(120deg,var(--dtsc-soft),var(--dtsc-surface),var(--dtsc-page))] p-5 shadow-[0_18px_55px_rgba(0,43,91,0.08)] transition hover:-translate-y-0.5 hover:border-cyan-400 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400 text-[#001736] shadow-[0_14px_34px_rgba(0,194,255,0.22)]">
                <HelpCircle className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Ressources DTSC</p>
                <h2 className="mt-1 text-2xl font-black text-dtsc-ink">Lisez nos guides, annonces, cas pratiques et articles pour mieux préparer vos projets.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
                  Accédez à des contenus utiles sur les 7 leviers DTSC, avec des exemples comme les dashboards, l&apos;IA documentaire, les workflows numériques et le pilotage par les données.
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

      <PublicPWAInstallCard />

      <section className="dtsc-public-band-light border-b border-dtsc-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Les 7 leviers numériques DTSC</p>
              <h2 className="dtsc-ink-shimmer mt-2 text-3xl font-black text-dtsc-ink">
                Une grille simple pour transformer un besoin en résultat mesurable.
              </h2>
            </div>
            <p className="leading-7 text-dtsc-muted">
              DTSC aide les entreprises à booster leur performance avec 7 leviers numériques: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {leverCards.map((item, index) => (
              <Link
                key={item.title}
                href="/services"
                className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover dtsc-premium-reveal p-6`}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{item.text}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Voir le levier
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-dtsc-border dtsc-public-band-soft">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Quel problème voulez-vous résoudre ?</p>
            <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Partez de votre besoin, DTSC rattache le bon levier.</h2>
            <p className="mt-4 leading-7 text-dtsc-muted">
              Les exemples ci-dessous orientent vers des pages existantes pour approfondir sans créer de faux parcours ni de bouton placeholder.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {problemCards.map((item, index) => (
              <Link
                key={item.title}
                href={item.href}
                className="dtsc-card-hover dtsc-premium-reveal rounded-2xl border border-dtsc-border bg-dtsc-surface p-5 shadow-[0_12px_34px_rgba(0,43,91,0.08)]"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <p className="text-lg font-black text-dtsc-ink">{item.title}</p>
                <p className="mt-3 rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-black text-dtsc-blue">{item.levers}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Explorer la réponse DTSC
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-dtsc-border dtsc-public-band-cyan">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Cas d&apos;usage rapides</p>
              <h2 className="mt-2 text-3xl font-black text-dtsc-ink">Des projets concrets pour lancer une première action.</h2>
            </div>
            <p className="leading-7 text-dtsc-muted">
              Chaque cas d&apos;usage renvoie vers une page existante: services, solutions, projets, ressources, BI & KPI, IA ou contact.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {useCaseCards.map((item, index) => (
              <Link
                key={item.title}
                href={item.href}
                className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover dtsc-premium-reveal p-6`}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <Megaphone className="h-6 w-6 text-cyan-500" />
                <h3 className="mt-5 text-xl font-black text-dtsc-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-dtsc-muted">{item.text}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-dtsc-blue underline underline-offset-4">
                  Voir le cas
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="dtsc-public-band-light border-b border-dtsc-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Explorer DTSC</p>
            <h2 className="dtsc-ink-shimmer mt-2 text-3xl font-black text-dtsc-ink">
              Découvrez les <span className="text-dtsc-blue">7 leviers</span> à travers des pages dédiées.
            </h2>
            <p className="mt-4 leading-7 text-dtsc-muted">
              Retrouvez en un coup d&apos;œil nos services, solutions, secteurs d&apos;intervention et projets. Chaque rubrique explique comment les 7 leviers DTSC se déclinent en exemples, cas d&apos;application et résultats mesurables.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {gateways.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${index % 2 === 0 ? "dtsc-card" : "dtsc-card-alt"} dtsc-card-hover dtsc-premium-reveal p-6`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
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
        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
          <div className="min-w-0 rounded-[1.5rem] bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.18)] sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-300">Pourquoi DTSC ?</p>
            <h2 className="mt-3 text-3xl font-black">
              Une approche claire autour de <span className="text-cyan-300">7 leviers</span> numériques.
            </h2>
            <p className="mt-4 leading-7 text-slate-300">
              DTSC relie chaque besoin à un levier officiel pour éviter la dispersion: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.
            </p>
          </div>
          <div className="grid min-w-0 gap-3">
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
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div className="min-w-0 lg:sticky lg:top-24">
              <p className="inline-flex items-center gap-2 rounded-full bg-dtsc-soft px-3 py-1.5 text-sm font-black text-dtsc-blue">
                <HelpCircle className="h-4 w-4" />
                Questions fréquentes
              </p>
              <h2 className="mt-5 max-w-2xl text-3xl font-black leading-tight text-dtsc-ink sm:text-5xl">
                Tout ce qu&apos;un client veut clarifier avant de démarrer avec DTSC.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-dtsc-muted">
                Une FAQ structurée pour comprendre les 7 leviers, la plateforme, la confidentialité, les abonnements et l&apos;accompagnement DTSC avant de prendre contact.
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

            <div className="grid min-w-0 gap-4">
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
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <h2 className="text-3xl font-black">Passez à une nouvelle étape de performance numérique.</h2>
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
      <DtscAgentWidget />
    </main>
  );
}
