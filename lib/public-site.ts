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
  heroImage: string;
  heroImages?: string[];
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
  { title: "Data & BI", text: "Dashboards, KPI, reporting et pilotage clair par les données.", icon: Database },
  { title: "Intelligence artificielle", text: "Chatbots, assistants documentaires, modèles prédictifs et automatisation intelligente.", icon: BrainCircuit },
  { title: "Solutions digitales", text: "Applications web, ERP, CRM, portails clients et workflows numériques utiles.", icon: Layers3 },
  { title: "Audit & optimisation", text: "Analyse des coûts, anomalies, pertes et processus à améliorer.", icon: ShieldCheck },
  { title: "Formations", text: "Formation data, IA, lecture des KPI et adoption des outils numériques.", icon: GraduationCap },
  { title: "Marketing digital", text: "Visibilité, acquisition clients, branding et campagnes digitales.", icon: Network },
  { title: "Imprimerie numérique", text: "Brochures, flyers, cartes et supports commerciaux professionnels.", icon: FileText },
];

export const solutionsCards: PublicCard[] = [
  { title: "Chatbot intelligent", text: "Exemple du levier Intelligence artificielle pour qualifier et orienter les besoins.", icon: Bot },
  { title: "Dashboards Power BI", text: "Exemple du levier Data & BI pour suivre KPI, reporting et décisions.", icon: BarChart3 },
  { title: "Applications web", text: "Exemple du levier Solutions digitales pour structurer les opérations internes.", icon: Layers3 },
  { title: "Workflows numériques", text: "Exemple des leviers Solutions digitales et IA pour réduire les doubles saisies.", icon: Workflow },
  { title: "Portails clients, ERP & CRM", text: "Exemples du levier Solutions digitales pour centraliser les parcours clients.", icon: Building2 },
  { title: "Assistant documentaire", text: "Exemple du levier Intelligence artificielle pour interroger des documents validés.", icon: UploadCloud },
];

export const sectorCards: PublicCard[] = [
  { title: "Santé", text: "7 leviers adaptés aux cliniques, pharmacies, données sanitaires et supports patients.", icon: Stethoscope },
  { title: "Assurances", text: "7 leviers appliqués au portefeuille, aux sinistres, anomalies et campagnes clients.", icon: ShieldCheck },
  { title: "PME & startups", text: "7 leviers pour structurer les données, les outils internes, la visibilité et l'adoption.", icon: BriefcaseBusiness },
  { title: "ONG & institutions", text: "7 leviers adaptés au suivi projets, aux données terrain et aux supports bailleurs.", icon: Building2 },
  { title: "Éducation", text: "7 leviers pour suivre les apprenants, former les équipes et digitaliser les parcours.", icon: GraduationCap },
  { title: "Finance", text: "7 leviers pour piloter performance, contrôle, conformité et qualité des données.", icon: Landmark },
  { title: "Administration", text: "7 leviers pour clarifier les processus, demandes, indicateurs et services aux usagers.", icon: ClipboardCheck },
];

export const publicLongPages: Record<string, PublicLongPage> = {
  services: {
    eyebrow: "Services DTSC",
    title: "7 leviers numériques pour booster la performance des entreprises.",
    intro:
      "DTSC accompagne les organisations avec 7 leviers officiels: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
    tone: "blue",
    heroLabel: "Conseil + Exécution",
    heroImage: "https://images.pexels.com/photos/3931504/pexels-photo-3931504.jpeg?auto=compress&cs=tinysrgb&w=1400",
    heroImages: [
      "https://images.pexels.com/photos/3931504/pexels-photo-3931504.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/6457575/pexels-photo-6457575.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/7698802/pexels-photo-7698802.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/3866432/pexels-photo-3866432.jpeg?auto=compress&cs=tinysrgb&w=1400",
    ],
    cards: serviceCards,
    sources: trustedSources,
    sections: [
      {
        heading: "Avancer avec les 7 leviers DTSC",
        text:
          "Beaucoup d'organisations veulent progresser sans se disperser dans des offres difficiles à comparer. DTSC structure l'accompagnement autour de 7 leviers numériques, puis choisit avec vous les actions prioritaires selon vos objectifs, vos équipes et vos indicateurs.",
        bullets: ["Diagnostic initial", "Choix des leviers prioritaires", "Livrables mesurables", "Formation et adoption"],
      },
      {
        heading: "Relier les exemples aux bons leviers",
        text:
          "Les dashboards, chatbots, ERP, CRM, portails clients, assistants documentaires et workflows numériques ne sont pas des services séparés. Ce sont des exemples concrets rattachés aux leviers Data & BI, Intelligence artificielle et Solutions digitales selon le besoin.",
        bullets: ["Dashboards KPI dans Data & BI", "Chatbots dans Intelligence artificielle", "ERP, CRM et portails dans Solutions digitales", "Audit des processus dans Audit & optimisation"],
      },
      {
        heading: "Un même objectif: la performance mesurable",
        text:
          "Chaque levier DTSC doit produire un gain lisible: temps gagné, meilleur suivi, coûts réduits, visibilité accrue, adoption des outils ou décisions plus fiables. L'accompagnement reste progressif et adapté à votre réalité métier.",
        bullets: ["Performance opérationnelle", "Réduction des coûts", "Visibilité commerciale", "Adoption par les équipes"],
      },
    ],
  },
  solutions: {
    eyebrow: "Solutions",
    title: "Des exemples concrets rattachés aux 7 leviers numériques DTSC.",
    intro:
      "Les solutions DTSC illustrent les 7 leviers numériques: elles montrent comment un chatbot, un dashboard, un portail ou un assistant documentaire peut devenir un cas d'usage utile, sans créer une liste de services parallèle.",
    tone: "cyan",
    heroLabel: "Solutions métier",
    heroImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80",
    heroImages: [
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1400&q=80",
    ],
    cards: solutionsCards,
    sources: trustedSources,
    sections: [
      {
        heading: "Intelligence artificielle: chatbot et assistant documentaire",
        text:
          "Un chatbot ou un assistant documentaire est présenté comme une application du levier Intelligence artificielle. Il peut orienter les visiteurs, qualifier les besoins, rechercher dans des documents validés et préparer une suite logique, avec validation humaine pour les décisions importantes.",
        bullets: ["Qualification des besoins", "Réponses claires", "Escalade humaine", "Recherche documentaire contrôlée"],
      },
      {
        heading: "Data & BI et Solutions digitales",
        text:
          "Les dashboards, KPI, reporting et tableaux de bord relèvent du levier Data & BI. Les applications web, ERP, CRM, portails clients et outils internes relèvent du levier Solutions digitales. Le but reste de centraliser l'information, réduire les pertes de temps et donner aux managers une lecture fiable de l'activité.",
        bullets: ["Power BI et reporting dans Data & BI", "Applications web dans Solutions digitales", "ERP, CRM et portails clients", "Workflows numériques utiles"],
      },
      {
        heading: "Audit & optimisation avant le déploiement",
        text:
          "Avant de multiplier les outils, DTSC peut analyser les processus, les pertes de temps, les anomalies et les coûts. Cet audit rattache chaque solution au levier le plus pertinent et permet de prioriser ce qui produit un impact mesurable.",
        bullets: ["Processus observés", "Anomalies identifiées", "Coûts à réduire", "Priorités de mise en œuvre"],
      },
    ],
  },
  secteurs: {
    eyebrow: "Secteurs",
    title: "Les 7 leviers DTSC adaptés à chaque réalité métier.",
    intro:
      "Les secteurs ne créent pas de nouveaux services DTSC: ils montrent comment les 7 leviers numériques peuvent être adaptés aux assurances, cliniques, pharmacies, PME, ONG, institutions, écoles, finances et administrations.",
    tone: "emerald",
    heroLabel: "Marchés cibles",
    heroImage: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1400&q=80",
    heroImages: [
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1400&q=80",
      "https://images.pexels.com/photos/5452254/pexels-photo-5452254.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/8636601/pexels-photo-8636601.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1400&q=80",
    ],
    cards: sectorCards,
    sources: trustedSources,
    sections: [
      {
        heading: "Santé, cliniques et pharmacies",
        text:
          "Dans la santé, les 7 leviers DTSC peuvent soutenir le suivi des stocks, la qualité de service, le reporting sanitaire, la confidentialité et l'adoption des outils. Les exemples sont adaptés aux cliniques, pharmacies et projets médicaux sans créer une offre santé séparée.",
        bullets: ["Data & BI pour le reporting médical", "Solutions digitales pour les stocks", "Audit & optimisation des coûts", "Formations et adoption"],
      },
      {
        heading: "Assurances et finance",
        text:
          "Les assurances et organisations financières bénéficient surtout des leviers Data & BI, Audit & optimisation, Solutions digitales et Marketing digital: suivi portefeuille, renouvellements, sinistres, risques, anomalies et performance commerciale.",
        bullets: ["KPI portefeuille et renouvellements", "Analyse sinistres et anomalies", "CRM comme exemple de Solutions digitales", "Performance commerciale"],
      },
      {
        heading: "PME, ONG et administrations",
        text:
          "Les PME, ONG et administrations peuvent commencer par un cas d'usage simple: données structurées, tableau de bord, portail, workflow numérique, formation ou campagne digitale. Chaque exemple reste rattaché à l'un des 7 leviers DTSC.",
        bullets: ["Démarrage progressif", "Reporting bailleurs dans Data & BI", "Portails dans Solutions digitales", "Marketing digital pour la visibilité"],
      },
    ],
  },
  projets: {
    eyebrow: "Projets & démonstrations",
    title: "Des cas d'application des 7 leviers numériques DTSC.",
    intro:
      "Les projets et démonstrations DTSC servent à tester rapidement la valeur d'un levier numérique avant d'investir dans un déploiement plus large.",
    tone: "indigo",
    heroLabel: "Démos utiles",
    heroImage: "https://images.pexels.com/photos/7710140/pexels-photo-7710140.jpeg?auto=compress&cs=tinysrgb&w=1400",
    heroImages: [
      "https://images.pexels.com/photos/7710140/pexels-photo-7710140.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/7845345/pexels-photo-7845345.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80",
    ],
    cards: [
      { title: "Prototype chatbot DTSC", text: "Cas d'application du levier Intelligence artificielle.", icon: Bot },
      { title: "Dashboard de reporting", text: "Cas d'application du levier Data & BI.", icon: BarChart3 },
      { title: "Application de gestion interne", text: "Cas d'application du levier Solutions digitales.", icon: Layers3 },
      { title: "Workflow numérique", text: "Cas d'application des leviers Solutions digitales et IA.", icon: Workflow },
      { title: "Plateforme client", text: "Cas d'application du levier Solutions digitales.", icon: Building2 },
    ],
    sources: trustedSources,
    sections: [
      {
        heading: "Prototyper pour réduire le risque",
        text:
          "Un prototype permet de tester rapidement la valeur d'un levier avant un déploiement complet. DTSC peut cadrer le besoin, produire une première version, recueillir les retours utilisateurs et prioriser les évolutions. Cette méthode réduit les risques de construire un outil trop complexe ou mal aligné avec les usages réels.",
        bullets: ["Levier prioritaire", "Prototype rapide", "Retours utilisateurs", "Décision d'investissement"],
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
          "Une démonstration réussie peut devenir une solution durable dans le levier concerné. DTSC aide à stabiliser les fonctionnalités, documenter les usages, former les équipes et préparer une amélioration continue après la mise en service.",
        bullets: ["Fonctionnalités utiles", "Documentation claire", "Formation", "Amélioration continue"],
      },
    ],
  },
  about: {
    eyebrow: "À propos",
    title: "DTSC, un cabinet de performance numérique basé à Kinshasa.",
    intro:
      "Data and Tech Solutions Consulting aide les organisations à booster leur performance à travers 7 leviers numériques: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
    tone: "slate",
    heroLabel: "Kinshasa · 2026",
    heroImage: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400",
    heroImages: [
      "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1400",
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80",
    ],
    cards: [
      { title: "Vision", text: "Devenir un leader africain de la performance mesurable par les 7 leviers numériques DTSC.", icon: Lightbulb },
      { title: "Mission", text: "Aider les entreprises à améliorer leur performance, réduire leurs coûts et accroître leur visibilité avec les 7 leviers.", icon: Rocket },
      { title: "Positionnement", text: "Combiner technologie et stratégie business pour créer un impact mesurable.", icon: BriefcaseBusiness },
      ...dtsc.organizationRoles.map((role) => ({ title: role.title, text: role.mission, icon: Building2 })),
    ],
    sources: trustedSources,
    sections: [
      {
        heading: "Une expertise structurée autour de 7 leviers",
        text:
          "DTSC réunit une compréhension du terrain, de la donnée, de l'IA, des solutions digitales, de l'audit, de la formation, du marketing digital et de l'imprimerie numérique. Cette combinaison permet d'aborder les projets avec une attention particulière à la qualité de service, à la confidentialité, à la simplicité d'usage et à l'impact mesurable pour le client.",
        bullets: ["Data & BI", "Intelligence artificielle", "Solutions digitales", "Audit & optimisation"],
      },
      {
        heading: "Organisation fonctionnelle",
        text:
          "DTSC est structurée autour de rôles complémentaires: direction générale, opérations, technologie, finances et ressources humaines, juridique, projets médicaux et supply chain. Cette organisation permet de couvrir à la fois la stratégie, l'exécution, la conformité, la qualité métier et la logistique.",
        bullets: ["CEO", "COO", "CTO", "HR & CFO", "Legal Advisor", "Management & Projects Officer", "Supply Chain Officer"],
      },
      {
        heading: "Roadmap et croissance",
        text:
          "DTSC avance avec une ambition claire: accompagner davantage d'organisations, améliorer continuellement ses cas d'application et rendre les 7 leviers plus accessibles aux entreprises qui veulent progresser rapidement sans perdre le contrôle de leurs opérations.",
        bullets: ["Accompagnement client", "Cas d'application évolutifs", "Formations", "Croissance maîtrisée"],
      },
    ],
  },
};
