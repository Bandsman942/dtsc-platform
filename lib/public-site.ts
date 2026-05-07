import { dtsc } from "@/lib/dtsc";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
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
  Stethoscope,
  UploadCloud,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type PublicSource = {
  label: string;
  href: string;
};

export type PublicCard = {
  title: string;
  text: string;
  icon?: LucideIcon;
};

export type PublicLongPage = {
  eyebrow: string;
  title: string;
  intro: string;
  tone: "blue" | "cyan" | "emerald" | "slate" | "indigo";
  heroLabel: string;
  cards: PublicCard[];
  sections: Array<{
    heading: string;
    text: string;
    bullets: string[];
  }>;
  sources?: PublicSource[];
};

export const trustedSources: PublicSource[] = [
  {
    label: "IFC - Digital Opportunities in African Businesses, 2024",
    href: "https://www.ifc.org/en/pressroom/2024/ifc-report-shows-digitalization-holds-immense-promise-economic-potential-for-african-businesses-of-all-sizes",
  },
  {
    label: "World Bank - Digital Transformation Drives Development in Africa",
    href: "https://www.worldbank.org/en/results/2024/01/18/digital-transformation-drives-development-in-afe-afw-africa.print",
  },
  {
    label: "GSMA - The Mobile Economy Sub-Saharan Africa 2024",
    href: "https://www.gsma.com/newsroom/press-release/powering-progress-through-connectivity-gsmas-mobile-economy-sub-saharan-africa-report-calls-for-action-to-close-the-digital-dividenew-report-highlights-opportunities-in-ai-5g-and-satellite-connectivit/",
  },
  {
    label: "NIST - AI Risk Management Framework",
    href: "https://www.nist.gov/itl/ai-risk-management-framework",
  },
  {
    label: "WHO - Global Strategy on Digital Health",
    href: "https://www.who.int/publications/i/item/9789240116870",
  },
];

export const serviceCards: PublicCard[] = [
  { title: "Transformation numérique", text: "Diagnostic, feuille de route, priorisation et accompagnement des chantiers digitaux.", icon: Rocket },
  { title: "Data & Business Intelligence", text: "Dashboards, KPI, reporting et culture de pilotage par les faits.", icon: Database },
  { title: "Automatisation & IA", text: "Chatbots, modèles prédictifs, automatisation de processus et assistance documentaire.", icon: BrainCircuit },
  { title: "Applications métier", text: "Développement web, portails clients, outils internes et solutions sur mesure.", icon: Layers3 },
  { title: "Audit & optimisation", text: "Réduction des coûts, analyse des anomalies, fraude potentielle et amélioration continue.", icon: ShieldCheck },
  { title: "Marketing digital", text: "Acquisition clients, visibilité numérique, branding et campagnes orientées performance.", icon: Network },
  { title: "Formation data", text: "Montée en compétence des équipes sur l'analyse de données et la lecture des KPI.", icon: GraduationCap },
  { title: "Imprimerie numérique", text: "Supports physiques professionnels pour renforcer la présence commerciale.", icon: FileText },
];

export const solutionsCards: PublicCard[] = [
  { title: "Chatbot intelligent", text: "Un assistant professionnel pour qualifier les besoins, structurer les demandes et orienter vers DTSC.", icon: Bot },
  { title: "Dashboards Power BI", text: "Des tableaux de bord lisibles pour suivre ventes, opérations, finances, risques et satisfaction.", icon: BarChart3 },
  { title: "Applications métier", text: "Des outils digitaux adaptés aux processus réels de l'organisation.", icon: Layers3 },
  { title: "Automatisation", text: "Des flux plus rapides pour réduire les doubles saisies, relances manuelles et pertes d'information.", icon: Workflow },
  { title: "Portails clients & CRM", text: "Des espaces structurés pour centraliser interactions, tickets, prospects et suivi commercial.", icon: Building2 },
  { title: "IA/RAG documentaire", text: "Une exploitation contrôlée des documents pour fournir des réponses plus contextualisées.", icon: UploadCloud },
];

export const sectorCards: PublicCard[] = [
  { title: "Santé", text: "Cliniques, projets médicaux, reporting sanitaire, tableaux de bord et confidentialité métier.", icon: Stethoscope },
  { title: "Assurances", text: "Suivi portefeuille, renouvellements, sinistres, performance commerciale et anomalies.", icon: ShieldCheck },
  { title: "PME & startups", text: "Outils simples, reporting dirigeant, marketing digital et automatisation des opérations.", icon: BriefcaseBusiness },
  { title: "ONG & institutions", text: "Suivi projets, reporting bailleurs, données de terrain et tableaux d'impact.", icon: Building2 },
  { title: "Éducation", text: "Suivi apprenants, indicateurs de formation, automatisation administrative et reporting.", icon: GraduationCap },
  { title: "Finance", text: "Pilotage de performance, contrôle, conformité, tableaux de bord et qualité des données.", icon: Landmark },
  { title: "Administration", text: "Processus internes, documents, demandes, indicateurs et amélioration du service.", icon: ClipboardCheck },
];

export const publicLongPages: Record<string, PublicLongPage> = {
  services: {
    eyebrow: "Services DTSC",
    title: "Des services de conseil et d'exécution pour transformer la performance.",
    intro:
      "DTSC combine stratégie business, data, IA, développement d'applications, marketing digital, formation et supports professionnels. L'objectif est de produire des résultats mesurables: meilleure visibilité, réduction des coûts, décisions plus fiables et opérations plus fluides.",
    tone: "blue",
    heroLabel: "Conseil + Exécution",
    cards: serviceCards,
    sources: trustedSources,
    sections: [
      {
        heading: "Transformer sans surcharger l'organisation",
        text:
          "De nombreuses organisations souhaitent accélérer leur transformation numérique, mais restent freinées par des outils dispersés, des fichiers peu standardisés et une faible adoption par les équipes. DTSC privilégie une approche progressive : comprendre les priorités, identifier les données disponibles, repérer les décisions à mieux piloter, puis déployer des solutions utiles, simples et mesurables. Cette méthode tient compte des réalités opérationnelles africaines, où le potentiel numérique est important, mais où les contraintes de coût, de compétences et d’infrastructure doivent être intégrées dès le départ.",
        bullets: ["Diagnostic initial", "Priorisation des gains rapides", "Livrables mesurables", "Formation et adoption"],
      },
      {
        heading: "Relier data, IA et applications métier",
        text:
          "Chez DTSC, la donnée, l’intelligence artificielle et les applications métier sont pensées ensemble. Un tableau de bord exige des données fiables, une automatisation repose sur un processus bien défini, et un chatbot devient réellement utile lorsqu’il comprend le contexte métier. Cette approche permet de créer des solutions cohérentes, durables et adaptées à l’évolution des organisations.",
        bullets: ["Dashboards KPI", "Applications web", "Automatisation", "Chatbots et IA maîtrisée"],
      },
      {
        heading: "Des solutions adaptées à chaque besoin",
        text:
          "DTSC accompagne les organisations selon leur niveau de maturité et leurs priorités : mission de conseil, développement d’une solution métier, automatisation d’un processus, formation des équipes ou accompagnement continu. L’objectif est simple : proposer une réponse claire, utile et adaptée aux besoins réels de chaque client.",
        bullets: ["Conseil stratégique", "Développement de solutions", "Formation des équipes"],
      },
    ],
  },
  solutions: {
    eyebrow: "Solutions",
    title: "Des solutions concrètes pour automatiser, piloter et mieux servir vos clients.",
    intro:
      "DTSC construit des solutions orientées cas d'usage: chatbot professionnel, dashboards, applications métier, portails clients, CRM, automatisations et IA documentaire.",
    tone: "cyan",
    heroLabel: "Solutions métier",
    cards: solutionsCards,
    sources: trustedSources,
    sections: [
      {
        heading: "Chatbot intelligent pour entreprises",
        text:
          "Le chatbot DTSC est conçu pour orienter les visiteurs, qualifier les besoins et préparer un échange plus structuré avec l'équipe. Il n'a pas vocation à promettre une prestation ou à remplacer une validation humaine. Il aide plutôt à clarifier le contexte, reformuler la demande et proposer une suite logique: contact, ticket, consultation ou approfondissement documentaire.",
        bullets: ["Qualification des besoins", "Réponses claires", "Escalade humaine", "Historique des échanges"],
      },
      {
        heading: "Dashboards et applications sur mesure",
        text:
          "Une solution professionnelle doit être adaptée à la façon dont les équipes travaillent. DTSC peut concevoir des tableaux de bord, des applications internes, des portails clients et des workflows d'automatisation. Le but est de centraliser l'information, réduire les pertes de temps et donner aux managers une lecture fiable de l'activité.",
        bullets: ["Power BI et reporting", "Applications métier", "Portails clients", "Automatisation des tâches"],
      },
      {
        heading: "IA documentaire et RAG",
        text:
          "L'IA documentaire permet d'améliorer la pertinence des réponses en exploitant des contenus validés. DTSC prévoit cette approche pour aider les équipes à interroger leurs documents métier dans un cadre privé, avec des droits d'accès et une validation humaine lorsque la décision devient critique.",
        bullets: ["Documents privés", "Réponses contextualisées", "Recherche sémantique", "Sécurité et confidentialité"],
      },
    ],
  },
  secteurs: {
    eyebrow: "Secteurs",
    title: "Des offres adaptées aux assurances, cliniques, pharmacies, PME et institutions.",
    intro:
      "Le marché cible DTSC inclut les assurances, cliniques, pharmacies et PME. Ces organisations partagent un besoin de visibilité, de structuration des données et d'amélioration opérationnelle.",
    tone: "emerald",
    heroLabel: "Marchés cibles",
    cards: sectorCards,
    sources: trustedSources,
    sections: [
      {
        heading: "Santé, cliniques et pharmacies",
        text:
          "Dans le secteur santé, les solutions numériques doivent améliorer la qualité de service sans négliger la confidentialité et les réalités opérationnelles. La stratégie mondiale de santé numérique de l'OMS rappelle que les initiatives efficaces doivent combiner ressources financières, organisationnelles, humaines et technologiques. DTSC traduit ce principe dans des projets concrets: tableaux de bord, suivi d'activité, gestion des stocks, reporting et solutions adaptées aux structures médicales.",
        bullets: ["Reporting médical", "Gestion des stocks", "Confidentialité", "Validation métier santé"],
      },
      {
        heading: "Assurances et finance",
        text:
          "Les assurances et organisations financières ont besoin de données fiables pour suivre les clients, renouvellements, ventes, sinistres, risques et anomalies. DTSC peut aider à définir les KPI, automatiser le reporting et construire des vues qui facilitent la décision. Cette approche s'inscrit dans une logique de performance, de contrôle et de meilleure expérience client.",
        bullets: ["Portefeuille clients", "Suivi sinistres", "Analyse anomalies", "Performance commerciale"],
      },
      {
        heading: "PME, ONG et administrations",
        text:
          "Les PME et institutions n'ont pas toujours besoin d'un grand système dès le départ. Elles ont souvent besoin d'un premier outil fiable: formulaire, base structurée, reporting, automatisation ou portail. DTSC accompagne cette progression par étapes afin de limiter les coûts et d'augmenter l'adoption.",
        bullets: ["Démarrage progressif", "Reporting bailleurs", "Automatisation administrative", "Outils légers et évolutifs"],
      },
    ],
  },
  projets: {
    eyebrow: "Projets & démonstrations",
    title: "Des démonstrations pour passer rapidement d'une idée à une solution exploitable.",
    intro:
      "DTSC développe des prototypes et produits digitaux pour rendre visibles les gains possibles: chatbot, dashboard, application interne, automatisation et plateforme client.",
    tone: "indigo",
    heroLabel: "Démos utiles",
    cards: [
      { title: "Prototype chatbot DTSC", text: "Qualification des besoins, historique, support et orientation client.", icon: Bot },
      { title: "Dashboard de reporting", text: "Suivi KPI, décisions et pilotage de performance.", icon: BarChart3 },
      { title: "Application de gestion interne", text: "Centralisation des tâches, comptes, documents et workflows.", icon: Layers3 },
      { title: "Système d'automatisation", text: "Réduction des relances manuelles et des erreurs de saisie.", icon: Workflow },
      { title: "Plateforme client", text: "Espace sécurisé avec tickets, notifications, documents et factures.", icon: Building2 },
    ],
    sources: trustedSources,
    sections: [
      {
        heading: "Prototyper pour réduire le risque",
        text:
          "Un prototype permet de tester rapidement la valeur d'une idée avant d'engager un développement complet. DTSC peut cadrer le besoin, produire une première version, recueillir les retours utilisateurs et prioriser les évolutions. Cette méthode réduit les risques de construire un outil trop complexe ou mal aligné avec les usages réels.",
        bullets: ["Prototype rapide", "Retours utilisateurs", "Priorisation", "Décision d'investissement"],
      },
      {
        heading: "Mesurer les gains",
        text:
          "Chaque projet doit être lié à un indicateur: temps gagné, réduction des erreurs, amélioration du suivi, meilleure visibilité commerciale, hausse de productivité ou réduction des coûts. Les KPI permettent de décider si le projet doit être renforcé, simplifié ou réorienté.",
        bullets: ["Temps de traitement", "Qualité des données", "Satisfaction client", "Coûts évités"],
      },
      {
        heading: "Passer du projet au produit",
        text:
          "La roadmap DTSC prévoit une progression vers des produits SaaS et une expansion régionale. Les démonstrations et projets pilotes servent donc aussi à identifier les fonctionnalités réutilisables et à préparer des offres plus scalables.",
        bullets: ["Offres réutilisables", "SaaS", "Documentation", "Amélioration continue"],
      },
    ],
  },
  about: {
    eyebrow: "À propos",
    title: "DTSC, un cabinet de performance numérique basé à Kinshasa.",
    intro:
      "Data and Tech Solutions Consulting est né pour aider les organisations africaines à améliorer leur performance grâce à la data, l'IA, l'automatisation, le marketing digital et les solutions métier.",
    tone: "slate",
    heroLabel: "Kinshasa · 2026",
    cards: [
      { title: "Vision", text: "Devenir un leader africain en transformation digitale et data consulting.", icon: Lightbulb },
      { title: "Mission", text: "Aider les entreprises à améliorer leur performance, réduire leurs coûts et accroître leur visibilité.", icon: Rocket },
      { title: "Positionnement", text: "Combiner technologie et stratégie business pour créer un impact mesurable.", icon: BriefcaseBusiness },
      ...dtsc.organizationRoles.map((role) => ({ title: role.title, text: role.mission, icon: Building2 })),
    ],
    sources: trustedSources,
    sections: [
      {
        heading: "Une expertise hybride",
        text:
          "Le business plan DTSC met en avant une expertise unique qui combine médecine, data et business. Cette combinaison donne au cabinet une sensibilité particulière aux projets où la qualité de service, la donnée, la confidentialité et l'organisation opérationnelle sont essentielles.",
        bullets: ["Médecine", "Data", "Business", "Technologie"],
      },
      {
        heading: "Organisation fonctionnelle",
        text:
          "DTSC est structurée autour de rôles complémentaires: direction générale, opérations, technologie, finances et ressources humaines, juridique, projets médicaux et supply chain. Cette organisation permet de couvrir à la fois la stratégie, l'exécution, la conformité, la qualité métier et la logistique.",
        bullets: ["CEO", "COO", "CTO", "HR & CFO", "Legal Advisor", "Medical Projects Officer", "Supply Chain Officer"],
      },
      {
        heading: "Roadmap et croissance",
        text:
          "La trajectoire prévue démarre par l'acquisition clients sur les 0 à 6 premiers mois, se poursuit par la structuration sur 6 à 12 mois, puis évolue vers des produits SaaS et une expansion régionale sur 1 à 3 ans. Le besoin de financement identifié sert à accélérer le marketing, le recrutement et le développement produit.",
        bullets: ["Acquisition clients", "Structuration", "Produits SaaS", "Expansion régionale"],
      },
    ],
  },
};
