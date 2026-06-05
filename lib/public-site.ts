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

export type PublicDeepDive = {
  title: string;
  eyebrow: string;
  problem: string;
  dtscAction: string;
  deliverables: string[];
  benefits: string[];
  examples: string[];
  links?: PublicSource[];
};

export type PublicJourney = {
  heading: string;
  text: string;
  steps: string[];
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
  deepDives?: PublicDeepDive[];
  journey?: PublicJourney;
  faqs?: Array<{ question: string; answer: string }>;
  ctaLinks?: PublicSource[];
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

const serviceDeepDives: PublicDeepDive[] = [
  {
    title: "Data & BI",
    eyebrow: "Piloter avec des chiffres fiables",
    problem: "Les décisions sont lentes lorsque les ventes, stocks, finances, projets et opérations restent dispersés dans plusieurs fichiers ou conversations.",
    dtscAction: "DTSC structure les sources prioritaires, clarifie les définitions métier, construit des dashboards et accompagne la lecture régulière des KPI.",
    deliverables: ["Tableau de bord dirigeant", "Dictionnaire KPI", "Rapport automatisé", "Atelier de lecture des indicateurs"],
    benefits: ["Visibilité fiable", "Décisions plus rapides", "Moins de débats sur les chiffres", "Suivi régulier des priorités"],
    examples: ["Dashboard exécutif", "Reporting commercial", "Suivi des stocks", "Power BI comme exemple Data & BI"],
    links: [
      { label: "Approfondir BI & KPI", href: "/bi-kpi" },
      { label: "Comprendre la data en Afrique", href: "/data-afrique" },
    ],
  },
  {
    title: "Intelligence artificielle",
    eyebrow: "Gagner du temps sans perdre le contrôle humain",
    problem: "Les équipes perdent du temps sur les questions répétitives, la recherche documentaire, les synthèses et les tâches de qualification.",
    dtscAction: "DTSC cadre des cas d'usage IA réalistes: chatbot, assistant documentaire, automatisation intelligente et analyse prédictive avec validation humaine.",
    deliverables: ["Assistant IA", "Base documentaire contrôlée", "Workflow IA", "Rapport d'usage et limites"],
    benefits: ["Réponse client plus rapide", "Productivité renforcée", "Documents mieux exploités", "Décisions sensibles validées"],
    examples: ["Chatbot client", "Assistant documentaire", "Synthèse de demandes", "Détection d'anomalies"],
    links: [
      { label: "Explorer IA en entreprise", href: "/ia-entreprise" },
      { label: "Voir les solutions IA", href: "/solutions" },
    ],
  },
  {
    title: "Solutions digitales",
    eyebrow: "Centraliser les processus utiles",
    problem: "Les processus manuels, formulaires isolés, fichiers non partagés et outils dispersés réduisent la traçabilité et la productivité.",
    dtscAction: "DTSC conçoit des applications web, ERP, CRM, portails et outils internes seulement quand ils répondent à un problème prioritaire.",
    deliverables: ["Application métier", "Portail client", "Module interne", "Formulaire digital et workflow"],
    benefits: ["Centralisation", "Traçabilité", "Moins de doubles saisies", "Expérience client plus fluide"],
    examples: ["CRM comme solution digitale", "Portail client", "ERP léger", "Workflow de validation"],
    links: [
      { label: "Voir les solutions", href: "/solutions" },
      { label: "Cadrer un projet", href: "/projets" },
    ],
  },
  {
    title: "Audit & optimisation",
    eyebrow: "Réduire les pertes invisibles",
    problem: "Les coûts, retards, anomalies, ruptures et pertes de qualité restent difficiles à corriger lorsqu'ils ne sont pas mesurés.",
    dtscAction: "DTSC analyse les flux, observe les points de friction, identifie les causes et transforme le diagnostic en plan d'amélioration priorisé.",
    deliverables: ["Rapport d'audit", "Cartographie processus", "Plan d'amélioration", "Indicateurs de suivi"],
    benefits: ["Réduction des coûts", "Meilleure organisation", "Priorités claires", "Actions plus rapides"],
    examples: ["Analyse des pertes", "Audit de stock", "Diagnostic commercial", "Optimisation d'un parcours client"],
    links: [
      { label: "Voir les secteurs", href: "/secteurs" },
      { label: "Demander un audit", href: "/contact" },
    ],
  },
  {
    title: "Formations",
    eyebrow: "Rendre les équipes autonomes",
    problem: "Un outil ne crée pas de valeur si les équipes ne comprennent pas les données, l'IA, les KPI ou les nouveaux processus.",
    dtscAction: "DTSC anime des formations pratiques, ateliers et supports d'adoption adaptés aux profils techniques comme non techniques.",
    deliverables: ["Module de formation", "Support participant", "Exercices pratiques", "Attestation interne si prévue"],
    benefits: ["Adoption réelle", "Autonomie", "Moins de dépendance externe", "Meilleure culture numérique"],
    examples: ["Lecture KPI", "Culture data", "Usage responsable de l'IA", "Adoption d'un dashboard"],
    links: [
      { label: "Préparer une formation", href: "/contact" },
      { label: "Lire les ressources", href: "/ressources" },
    ],
  },
  {
    title: "Marketing digital",
    eyebrow: "Créer une visibilité régulière",
    problem: "Une entreprise peut avoir une bonne offre mais manquer de visibilité, de cohérence de marque, de prospects ou de contenus réguliers.",
    dtscAction: "DTSC structure la communication, les campagnes, les messages, les visuels et les parcours d'acquisition selon les objectifs commerciaux.",
    deliverables: ["Calendrier éditorial", "Kit de contenus", "Campagne digitale", "Indicateurs de visibilité"],
    benefits: ["Plus de crédibilité", "Prospects mieux qualifiés", "Communication régulière", "Marque plus lisible"],
    examples: ["Campagne réseaux sociaux", "Refonte de messages", "Acquisition PME", "Branding commercial"],
    links: [
      { label: "Voir les cas d'usage", href: "/projets" },
      { label: "Contacter DTSC", href: "/contact" },
    ],
  },
  {
    title: "Imprimerie numérique",
    eyebrow: "Professionnaliser les supports commerciaux",
    problem: "Des supports faibles ou incohérents réduisent la crédibilité lors des rendez-vous, événements, formations et démarches commerciales.",
    dtscAction: "DTSC conçoit et produit des supports imprimés cohérents avec le message, l'offre, la marque et les campagnes digitales.",
    deliverables: ["Flyers", "Brochures", "Cartes", "Affiches et supports institutionnels"],
    benefits: ["Image plus professionnelle", "Supports de vente crédibles", "Communication terrain renforcée", "Cohérence print et digital"],
    examples: ["Kit commercial PME", "Brochure institutionnelle", "Support formation", "Affiche événement"],
    links: [
      { label: "Demander un kit", href: "/contact" },
      { label: "Voir les projets types", href: "/projets" },
    ],
  },
];

const solutionDeepDives: PublicDeepDive[] = [
  {
    title: "Chatbot intelligent",
    eyebrow: "Levier Intelligence artificielle",
    problem: "Les visiteurs et clients posent souvent les mêmes questions, mais les équipes n'ont pas toujours le temps de répondre vite et clairement.",
    dtscAction: "DTSC cadre un chatbot utile pour support client, qualification prospect, FAQ, demandes commerciales et escalade vers un humain.",
    deliverables: ["Scénarios de conversation", "Base de réponses validées", "Interface chatbot", "Règles d'escalade"],
    benefits: ["Réponses plus rapides", "Demandes mieux qualifiées", "Support plus fluide", "Temps gagné"],
    examples: ["FAQ commerciale", "Préqualification prospect", "Support de premier niveau", "Demande de consultation"],
    links: [{ label: "Comprendre l'IA utile", href: "/ia-entreprise" }],
  },
  {
    title: "Dashboard exécutif",
    eyebrow: "Levier Data & BI",
    problem: "La direction manque d'une vision synthétique pour suivre finances, opérations, ventes, projets ou risques.",
    dtscAction: "DTSC transforme les données clés en vues dirigeantes et opérationnelles, avec indicateurs lisibles et seuils d'alerte.",
    deliverables: ["Dashboard direction", "Vues opérationnelles", "Définitions KPI", "Rituel de revue"],
    benefits: ["Pilotage plus clair", "Priorisation rapide", "Alertes visibles", "Meilleure responsabilisation"],
    examples: ["Direction générale", "Finance", "Opérations", "Ventes et projets"],
    links: [{ label: "Voir BI & KPI", href: "/bi-kpi" }],
  },
  {
    title: "Application web, ERP ou CRM",
    eyebrow: "Levier Solutions digitales",
    problem: "Les équipes travaillent avec des fichiers éparpillés, des validations informelles et une faible traçabilité client ou interne.",
    dtscAction: "DTSC conçoit une solution digitale ciblée: gestion interne, portail client, CRM, ERP léger ou workflow métier.",
    deliverables: ["Prototype", "Parcours utilisateur", "Modules utiles", "Formation de prise en main"],
    benefits: ["Information centralisée", "Traçabilité", "Productivité", "Expérience plus professionnelle"],
    examples: ["Gestion interne", "Portail client", "Suivi commercial", "Workflow administratif"],
    links: [{ label: "Cadrer un projet", href: "/projets" }],
  },
  {
    title: "Assistant documentaire",
    eyebrow: "Levier Intelligence artificielle",
    problem: "Les procédures, contrats, offres et documents validés sont difficiles à retrouver ou à exploiter rapidement.",
    dtscAction: "DTSC structure une base documentaire et un assistant qui aide à rechercher, synthétiser et orienter sans contourner les permissions.",
    deliverables: ["Corpus documentaire", "Assistant de recherche", "Réponses contextualisées", "Règles de confidentialité"],
    benefits: ["Recherche plus rapide", "Moins d'erreurs", "Capitalisation interne", "Meilleure qualité de réponse"],
    examples: ["Procédures", "Contrats", "Offres commerciales", "Documents validés"],
    links: [{ label: "Explorer IA en entreprise", href: "/ia-entreprise" }],
  },
  {
    title: "Workflow automatisé",
    eyebrow: "Solutions digitales + Intelligence artificielle",
    problem: "Les relances, validations, rapports et notifications sont souvent manuels, oubliés ou trop dépendants d'une seule personne.",
    dtscAction: "DTSC cartographie le processus, supprime les étapes inutiles et automatise les relances ou synthèses quand cela crée un gain mesurable.",
    deliverables: ["Cartographie workflow", "Règles de validation", "Notifications", "Rapport de suivi"],
    benefits: ["Moins d'oublis", "Délais réduits", "Traçabilité", "Responsabilités claires"],
    examples: ["Relances", "Validation", "Rapports", "Notifications"],
    links: [{ label: "Voir les services", href: "/services" }],
  },
  {
    title: "Kit marketing digital",
    eyebrow: "Levier Marketing digital",
    problem: "La communication manque parfois de rythme, de cohérence et de messages assez clairs pour transformer l'attention en prospects.",
    dtscAction: "DTSC prépare les messages, visuels, contenus et campagnes alignés sur les objectifs commerciaux.",
    deliverables: ["Positionnement", "Calendrier éditorial", "Visuels", "Campagne et suivi"],
    benefits: ["Visibilité", "Crédibilité", "Prospects", "Communication régulière"],
    examples: ["Campagne PME", "Contenus réseaux sociaux", "Branding", "Page de conversion"],
    links: [{ label: "Nous contacter", href: "/contact" }],
  },
  {
    title: "Supports imprimés professionnels",
    eyebrow: "Levier Imprimerie numérique",
    problem: "Les actions terrain perdent en impact si les brochures, cartes, flyers ou affiches ne traduisent pas clairement l'offre.",
    dtscAction: "DTSC relie le message commercial, le design et l'impression pour produire des supports cohérents avec la présence digitale.",
    deliverables: ["Maquette", "Fichiers prêts impression", "Supports imprimés", "Déclinaisons commerciales"],
    benefits: ["Image premium", "Vente terrain plus crédible", "Message mémorisable", "Cohérence marque"],
    examples: ["Flyers", "Brochures", "Cartes", "Affiches"],
    links: [{ label: "Demander un support", href: "/contact" }],
  },
];

const sectorDeepDives: PublicDeepDive[] = [
  {
    title: "Santé",
    eyebrow: "Cliniques, pharmacies et cabinets médicaux",
    problem: "Les structures de santé doivent suivre patients, stocks, facturation, reporting médical et qualité de service avec rigueur.",
    dtscAction: "DTSC priorise Data & BI, Solutions digitales, Audit & optimisation et Formations pour rendre les flux plus lisibles.",
    deliverables: ["Dashboard médical", "Suivi stocks", "Audit des files d'attente", "Formation équipes"],
    benefits: ["Moins de ruptures", "Meilleur suivi", "Décisions médicales et opérationnelles mieux éclairées", "Qualité de service renforcée"],
    examples: ["Premier projet: tableau de bord activité et stock pharmacie"],
    links: [{ label: "Voir les solutions", href: "/solutions" }],
  },
  {
    title: "Assurances",
    eyebrow: "Portefeuille, sinistres et relation client",
    problem: "Les renouvellements, anomalies, sinistres et parcours clients exigent une vision portefeuille fiable.",
    dtscAction: "DTSC combine Data & BI, Audit & optimisation, Solutions digitales et Marketing digital pour clarifier la performance.",
    deliverables: ["Dashboard portefeuille", "Analyse anomalies", "CRM comme solution digitale", "Campagne de renouvellement"],
    benefits: ["Renouvellements mieux suivis", "Anomalies détectées", "Relation client structurée", "Pilotage commercial"],
    examples: ["Premier projet: suivi renouvellements et sinistres"],
    links: [{ label: "Voir les projets", href: "/projets" }],
  },
  {
    title: "PME & startups",
    eyebrow: "Croissance et organisation interne",
    problem: "Les PME doivent vendre, livrer, communiquer et suivre leurs chiffres sans multiplier les outils incohérents.",
    dtscAction: "DTSC aide à choisir le premier levier: Data & BI, Solutions digitales, Marketing digital, Audit ou Formation selon la priorité.",
    deliverables: ["Reporting dirigeant", "CRM léger", "Campagne digitale", "Kit de supports commerciaux"],
    benefits: ["Organisation plus claire", "Prospects mieux suivis", "Décisions rapides", "Communication plus professionnelle"],
    examples: ["Premier projet: dashboard dirigeant et pipeline commercial"],
    links: [{ label: "Demander une consultation", href: "/contact" }],
  },
  {
    title: "ONG & institutions",
    eyebrow: "Suivi projets et reporting bailleurs",
    problem: "Les projets terrain, données collectées, preuves et rapports bailleurs doivent rester transparents et vérifiables.",
    dtscAction: "DTSC structure collecte, reporting, dashboards, supports institutionnels et adoption par les équipes.",
    deliverables: ["Tableau de suivi projet", "Formulaire terrain", "Rapport bailleur", "Support institutionnel"],
    benefits: ["Transparence", "Reporting plus rapide", "Meilleure coordination", "Crédibilité renforcée"],
    examples: ["Premier projet: système de reporting ONG"],
    links: [{ label: "Lire les ressources", href: "/ressources" }],
  },
  {
    title: "Éducation",
    eyebrow: "Apprenants, enseignants et plateformes",
    problem: "Les écoles et centres de formation doivent suivre les apprenants, communiquer et former les équipes aux nouveaux usages.",
    dtscAction: "DTSC combine Solutions digitales, Formations, Data & BI et Marketing digital pour organiser les parcours.",
    deliverables: ["Suivi apprenants", "Plateforme ou portail", "Formation enseignants", "Contenus pédagogiques"],
    benefits: ["Suivi renforcé", "Communication claire", "Adoption des outils", "Meilleure expérience apprenant"],
    examples: ["Premier projet: suivi apprenants et communication parents"],
    links: [{ label: "Voir les services", href: "/services" }],
  },
  {
    title: "Finance",
    eyebrow: "Conformité, risques et indicateurs",
    problem: "Les organisations financières ont besoin d'indicateurs fiables, de contrôle, de conformité et d'une expérience client plus fluide.",
    dtscAction: "DTSC priorise Data & BI, Audit & optimisation, Solutions digitales et IA prudente pour soutenir le contrôle.",
    deliverables: ["KPI risques", "Tableau de conformité", "Audit processus", "Parcours client digital"],
    benefits: ["Risques mieux suivis", "Conformité plus lisible", "Anomalies visibles", "Pilotage renforcé"],
    examples: ["Premier projet: tableau de bord risques et conformité"],
    links: [{ label: "Approfondir BI & KPI", href: "/bi-kpi" }],
  },
  {
    title: "Administration",
    eyebrow: "Demandes, files d'attente et services aux usagers",
    problem: "Les administrations doivent simplifier les demandes, réduire les délais, suivre les files d'attente et mieux informer les usagers.",
    dtscAction: "DTSC combine Audit & optimisation, Solutions digitales, Data & BI, Formations et supports de communication.",
    deliverables: ["Cartographie processus", "Portail demande", "Dashboard délais", "Supports usagers"],
    benefits: ["Délais suivis", "Services plus lisibles", "Moins de perte d'information", "Usagers mieux orientés"],
    examples: ["Premier projet: suivi des demandes et délais de traitement"],
    links: [{ label: "Cadrer une solution", href: "/contact" }],
  },
];

const projectDeepDives: PublicDeepDive[] = [
  {
    title: "Dashboard exécutif intelligent",
    eyebrow: "Levier principal: Data & BI",
    problem: "La direction veut suivre l'activité sans attendre des rapports manuels.",
    dtscAction: "DTSC cadre les KPI, organise les sources et livre une vue dirigeante exploitable.",
    deliverables: ["Dashboard", "Dictionnaire KPI", "Vues direction et opérations"],
    benefits: ["Décisions plus rapides", "Vision consolidée", "Alertes plus visibles"],
    examples: ["Cible: dirigeants, finances, opérations", "Durée indicative: cadrage court puis itérations"],
    links: [{ label: "Voir BI & KPI", href: "/bi-kpi" }],
  },
  {
    title: "Chatbot IA pour PME",
    eyebrow: "Levier principal: Intelligence artificielle",
    problem: "Les prospects ont besoin de réponses rapides et d'une qualification claire.",
    dtscAction: "DTSC construit un assistant limité aux informations validées, avec escalade humaine.",
    deliverables: ["Scénarios", "Base FAQ", "Assistant", "Suivi des demandes"],
    benefits: ["Temps gagné", "Prospects mieux qualifiés", "Réponse plus régulière"],
    examples: ["Cible: PME et startups", "Levier secondaire: Marketing digital"],
    links: [{ label: "Voir IA en entreprise", href: "/ia-entreprise" }],
  },
  {
    title: "Digitalisation d'une clinique",
    eyebrow: "Solutions digitales + Data & BI",
    problem: "Les dossiers, rendez-vous, stocks et facturation sont difficiles à suivre.",
    dtscAction: "DTSC priorise un premier flux critique et relie les indicateurs à la gestion quotidienne.",
    deliverables: ["Parcours patient", "Suivi rendez-vous", "Dashboard activité", "Formation"],
    benefits: ["Qualité de service", "Traçabilité", "Meilleure organisation"],
    examples: ["Cible: cliniques et cabinets", "Premier livrable possible: prototype opérationnel"],
    links: [{ label: "Voir secteurs santé", href: "/secteurs" }],
  },
  {
    title: "Gestion intelligente des stocks",
    eyebrow: "Data & BI + Audit & optimisation",
    problem: "Les ruptures, surstocks et pertes ne sont pas mesurés assez vite.",
    dtscAction: "DTSC analyse les mouvements, seuils, anomalies et besoins de reporting.",
    deliverables: ["Diagnostic stock", "Dashboard seuils", "Processus d'alerte"],
    benefits: ["Moins de ruptures", "Coûts mieux contrôlés", "Commandes plus fiables"],
    examples: ["Cible: pharmacies, PME, logistique", "Levier secondaire: Solutions digitales"],
    links: [{ label: "Demander un audit", href: "/contact" }],
  },
  {
    title: "Portail client pour assurance",
    eyebrow: "Solutions digitales",
    problem: "Les clients et agents manquent d'un espace clair pour suivre demandes, documents et renouvellements.",
    dtscAction: "DTSC cadre un portail utile, connecté aux priorités commerciales et au reporting.",
    deliverables: ["Prototype portail", "Parcours client", "Dashboard demandes"],
    benefits: ["Relation client plus fluide", "Suivi renouvellements", "Meilleure traçabilité"],
    examples: ["Cible: assurances", "Levier secondaire: Marketing digital"],
    links: [{ label: "Voir solutions", href: "/solutions" }],
  },
  {
    title: "Système de reporting ONG",
    eyebrow: "Data & BI",
    problem: "Les équipes terrain et bailleurs ont besoin de preuves, indicateurs et rapports réguliers.",
    dtscAction: "DTSC structure la collecte et transforme les données en reporting lisible.",
    deliverables: ["Formulaire terrain", "Dashboard projet", "Rapport bailleur"],
    benefits: ["Transparence", "Gain de temps", "Meilleure coordination"],
    examples: ["Cible: ONG et institutions", "Levier secondaire: Formations"],
    links: [{ label: "Lire data en Afrique", href: "/data-afrique" }],
  },
  {
    title: "Kit marketing digital pour PME",
    eyebrow: "Marketing digital",
    problem: "La PME manque de messages réguliers, visuels cohérents et appels à l'action.",
    dtscAction: "DTSC clarifie l'offre, prépare les contenus et suit les premiers indicateurs.",
    deliverables: ["Calendrier éditorial", "Visuels", "Textes", "Campagne"],
    benefits: ["Visibilité", "Prospects", "Crédibilité"],
    examples: ["Cible: PME et startups", "Levier secondaire: Imprimerie numérique"],
    links: [{ label: "Contacter DTSC", href: "/contact" }],
  },
  {
    title: "Audit & optimisation des processus",
    eyebrow: "Audit & optimisation",
    problem: "Les pertes de temps, coûts et erreurs ne sont pas clairement localisés.",
    dtscAction: "DTSC observe les flux, mesure les anomalies et recommande les leviers prioritaires.",
    deliverables: ["Cartographie", "Rapport d'audit", "Plan d'amélioration"],
    benefits: ["Coûts réduits", "Priorités claires", "Processus simplifiés"],
    examples: ["Cible: PME, institutions, administrations", "Levier secondaire: Formations"],
    links: [{ label: "Démarrer par contact", href: "/contact" }],
  },
  {
    title: "Formation data pour managers",
    eyebrow: "Formations",
    problem: "Les managers reçoivent des chiffres mais ne savent pas toujours les interpréter ou les transformer en actions.",
    dtscAction: "DTSC anime une formation pratique sur KPI, lecture dashboard et décisions de management.",
    deliverables: ["Support", "Exercices", "Cas métier", "Synthèse d'adoption"],
    benefits: ["Autonomie", "Décisions plus cohérentes", "Adoption des dashboards"],
    examples: ["Cible: managers et responsables", "Levier secondaire: Data & BI"],
    links: [{ label: "Lire BI & KPI", href: "/bi-kpi" }],
  },
  {
    title: "Kit de supports commerciaux imprimés",
    eyebrow: "Imprimerie numérique",
    problem: "Les équipes commerciales ont besoin de supports crédibles pour rendez-vous, événements et prospection terrain.",
    dtscAction: "DTSC relie message, design et production imprimée pour soutenir la vente.",
    deliverables: ["Flyer", "Brochure", "Carte", "Support événement"],
    benefits: ["Image professionnelle", "Message clair", "Prospection mieux outillée"],
    examples: ["Cible: PME, formations, institutions", "Levier secondaire: Marketing digital"],
    links: [{ label: "Demander un kit", href: "/contact" }],
  },
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
    deepDives: serviceDeepDives,
    journey: {
      heading: "Comment choisir le bon levier",
      text:
        "DTSC part du problème client, pas de la technologie. Le cadrage permet de choisir le levier prioritaire, de définir un premier livrable utile et de mesurer rapidement si l'action produit un gain.",
      steps: ["Diagnostic du besoin", "Choix du levier prioritaire", "Livrable initial", "Formation ou accompagnement", "Suivi des résultats"],
    },
    faqs: [
      {
        question: "Quel levier choisir selon votre problème ?",
        answer:
          "Si le problème porte sur les chiffres et indicateurs, commencez par Data & BI. Si le problème porte sur des tâches répétitives ou documents difficiles à exploiter, explorez l'Intelligence artificielle. Si le problème vient d'un processus manuel, une Solution digitale ou un Audit & optimisation peut être prioritaire.",
      },
      {
        question: "Quels livrables pouvez-vous recevoir ?",
        answer:
          "Selon le levier, DTSC peut livrer un dashboard, un prototype, un rapport d'audit, un support de formation, une campagne digitale, un assistant IA ou des supports imprimés professionnels.",
      },
      {
        question: "Comment DTSC mesure les résultats ?",
        answer:
          "Chaque action est reliée à des indicateurs simples: temps gagné, qualité des données, réduction des erreurs, visibilité commerciale, adoption par les équipes ou coûts évités.",
      },
      {
        question: "Comment démarrer ?",
        answer:
          "Le plus simple est de décrire votre contexte sur la page Contact. DTSC identifie ensuite le levier prioritaire et propose une première action réaliste.",
      },
    ],
    ctaLinks: [
      { label: "Voir les solutions", href: "/solutions" },
      { label: "Explorer les secteurs", href: "/secteurs" },
      { label: "Demander une consultation", href: "/contact" },
    ],
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
    deepDives: solutionDeepDives,
    journey: {
      heading: "De l'idée à la solution",
      text:
        "Une solution DTSC n'est pas forcément un logiciel complet dès le départ. DTSC sécurise le parcours avec un cadrage progressif, un prototype ou un premier livrable, puis une validation par les utilisateurs.",
      steps: ["Cadrage", "Prototype", "Test", "Formation", "Déploiement", "Suivi"],
    },
    faqs: [
      {
        question: "Une solution est-elle toujours un logiciel ?",
        answer:
          "Non. Une solution peut être un dashboard, un assistant IA, un workflow, un kit marketing, une formation ou un support imprimé. Elle doit surtout résoudre un problème réel.",
      },
      {
        question: "Peut-on commencer par un prototype ?",
        answer:
          "Oui. Le prototype permet de tester l'usage, réduire le risque et décider ensuite si un déploiement plus complet est pertinent.",
      },
      {
        question: "Comment éviter de créer un outil inutile ?",
        answer:
          "DTSC commence par le problème, les utilisateurs, les données disponibles et les résultats attendus. Un outil n'est proposé que s'il apporte un gain mesurable.",
      },
      {
        question: "Comment rattacher chaque solution aux 7 leviers ?",
        answer:
          "Le chatbot et l'assistant documentaire relèvent de l'IA, les dashboards relèvent de Data & BI, les ERP/CRM/portails relèvent des Solutions digitales, et les kits de communication relèvent du Marketing digital ou de l'Imprimerie numérique.",
      },
    ],
    ctaLinks: [
      { label: "Voir les services", href: "/services" },
      { label: "Voir les projets types", href: "/projets" },
      { label: "Explorer IA", href: "/ia-entreprise" },
      { label: "Cadrer une solution", href: "/contact" },
    ],
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
    deepDives: sectorDeepDives,
    journey: {
      heading: "Adapter les 7 leviers à votre secteur",
      text:
        "DTSC analyse vos douleurs métier, identifie les leviers prioritaires et propose un premier projet concret au lieu d'appliquer une méthode générique.",
      steps: ["Douleurs typiques", "Leviers prioritaires", "Solutions possibles", "Résultats attendus", "Premier projet"],
    },
    faqs: [
      {
        question: "Quels leviers pour mon secteur ?",
        answer:
          "Les leviers dépendent de votre problème prioritaire. Santé et assurance commencent souvent par Data & BI ou Solutions digitales, tandis qu'une PME peut prioriser Marketing digital, Audit ou CRM selon son besoin.",
      },
      {
        question: "Quel premier projet lancer ?",
        answer:
          "Un premier projet doit être court, mesurable et utile: dashboard d'activité, suivi stock, campagne digitale, audit processus ou formulaire de collecte.",
      },
      {
        question: "Quels résultats mesurer ?",
        answer:
          "Les résultats peuvent porter sur le temps de traitement, les ventes, les ruptures de stock, les délais, la satisfaction client, la qualité des données ou la visibilité commerciale.",
      },
    ],
    ctaLinks: [
      { label: "Voir les services", href: "/services" },
      { label: "Voir les solutions", href: "/solutions" },
      { label: "Voir les projets", href: "/projets" },
      { label: "Parler de votre secteur", href: "/contact" },
    ],
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
    deepDives: projectDeepDives,
    journey: {
      heading: "Comment DTSC transforme un projet en résultat mesurable",
      text:
        "Chaque projet type est volontairement rattaché à un levier principal, à des leviers secondaires et à un résultat à suivre. Cela évite les projets trop larges et facilite la décision.",
      steps: ["Diagnostic", "Choix du levier", "Cadrage", "Prototype ou livrable initial", "Test", "Formation", "Déploiement", "Suivi KPI"],
    },
    faqs: [
      {
        question: "Peut-on commencer petit ?",
        answer:
          "Oui. DTSC recommande souvent un premier livrable ciblé pour valider l'usage, les données, l'adoption et le retour opérationnel.",
      },
      {
        question: "Comment choisir un projet prioritaire ?",
        answer:
          "Choisissez le projet qui réduit une douleur visible, mobilise peu de dépendances bloquantes et produit un indicateur mesurable rapidement.",
      },
      {
        question: "Combien coûte un projet ?",
        answer:
          "Le coût dépend du périmètre, des données disponibles, du niveau de personnalisation et de l'accompagnement. DTSC évite d'annoncer un prix sans cadrage.",
      },
      {
        question: "Quels livrables DTSC fournit ?",
        answer:
          "Les livrables peuvent inclure diagnostic, prototype, dashboard, support de formation, application, workflow, campagne, rapport ou kit imprimé selon le levier retenu.",
      },
    ],
    ctaLinks: [
      { label: "Voir les services", href: "/services" },
      { label: "Explorer les secteurs", href: "/secteurs" },
      { label: "Cadrer votre projet", href: "/contact" },
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
    deepDives: [
      {
        title: "Vision",
        eyebrow: "Performance numérique mesurable",
        problem:
          "Beaucoup d'organisations africaines ont déjà des données, des équipes et des idées, mais manquent d'une méthode simple pour transformer ces éléments en performance.",
        dtscAction:
          "DTSC veut devenir un acteur africain de référence dans la performance numérique mesurable, en partant de Kinshasa et des réalités opérationnelles locales.",
        deliverables: ["Diagnostic", "Priorisation", "Feuille de route", "Suivi des gains"],
        benefits: ["Décisions plus fiables", "Exécution plus claire", "Croissance mieux pilotée"],
        examples: ["PME", "Santé", "Assurances", "ONG", "Institutions"],
        links: [{ label: "Voir les secteurs", href: "/secteurs" }],
      },
      {
        title: "Méthode",
        eyebrow: "7 leviers, une exécution progressive",
        problem:
          "Un projet numérique peut vite devenir trop large s'il n'est pas relié à un problème, un livrable et un résultat mesurable.",
        dtscAction:
          "DTSC travaille par diagnostic, priorisation, exécution, formation et suivi afin que chaque levier produise une valeur observable.",
        deliverables: ["Cadrage", "Prototype ou livrable", "Formation", "KPI de suivi"],
        benefits: ["Moins de dispersion", "Adoption renforcée", "Résultats lisibles"],
        examples: ["Data & BI", "IA", "Solutions digitales", "Audit", "Formations"],
        links: [{ label: "Voir les services", href: "/services" }],
      },
      {
        title: "Organisation interne",
        eyebrow: "Rôles complémentaires",
        problem:
          "La crédibilité d'un accompagnement dépend aussi de la capacité à couvrir stratégie, opérations, technologie, finances, projets, achats et juridique.",
        dtscAction:
          "DTSC structure ses rôles autour du CEO, COO, CTO, HR & CFO, MPO, SCO et Legal Advisor pour relier conseil, exécution et gouvernance.",
        deliverables: ["Supervision stratégique", "Pilotage opérationnel", "Qualité technique", "Cadre juridique"],
        benefits: ["Meilleure coordination", "Risques mieux suivis", "Responsabilités claires"],
        examples: ["Portefeuille projets", "Sécurité", "Budgets", "Contrats", "Logistique"],
        links: [{ label: "Nous contacter", href: "/contact" }],
      },
    ],
    journey: {
      heading: "Pourquoi les 7 leviers ?",
      text:
        "Les 7 leviers donnent une grille simple pour comprendre un besoin client sans réduire DTSC à un outil, un logiciel ou une tendance. Ils permettent de combiner conseil, data, IA, exécution, adoption et communication.",
      steps: ["Comprendre le problème", "Choisir le levier", "Produire un livrable", "Former les équipes", "Mesurer l'impact"],
    },
    faqs: [
      {
        question: "Pourquoi DTSC parle de performance mesurable ?",
        answer:
          "Parce qu'un projet numérique doit améliorer quelque chose de concret: temps, coûts, qualité, visibilité, traçabilité, satisfaction client ou adoption par les équipes.",
      },
      {
        question: "Pourquoi combiner conseil, data, IA et exécution ?",
        answer:
          "Le conseil seul ne suffit pas si rien n'est livré. L'exécution seule peut créer un outil mal cadré. DTSC combine cadrage, livrable, adoption et mesure.",
      },
      {
        question: "Pourquoi commencer par les PME et organisations africaines ?",
        answer:
          "Ces organisations ont souvent beaucoup de potentiel, mais des outils et données encore dispersés. Un accompagnement progressif peut produire des gains rapides et visibles.",
      },
    ],
    ctaLinks: [
      { label: "Voir les services", href: "/services" },
      { label: "Voir les ressources", href: "/ressources" },
      { label: "Contacter DTSC", href: "/contact" },
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
