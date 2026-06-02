export type PublicSearchItem = {
  title: string;
  description: string;
  href: string;
  category: string;
};

export const publicSearchIndex: PublicSearchItem[] = [
  {
    title: "Accueil DTSC Platform",
    description: "Présentation de DTSC et de ses 7 leviers numériques de performance.",
    href: "/",
    category: "Accueil",
  },
  {
    title: "Services DTSC",
    description: "Les 7 leviers DTSC: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
    href: "/services",
    category: "Services",
  },
  {
    title: "Solutions entreprises",
    description: "Chatbot, dashboards, portails, ERP, CRM et assistant documentaire comme exemples rattachés aux 7 leviers.",
    href: "/solutions",
    category: "Solutions",
  },
  {
    title: "Secteurs accompagnés",
    description: "Santé, assurances, PME, ONG, institutions, éducation, finance et administration.",
    href: "/secteurs",
    category: "Secteurs",
  },
  {
    title: "Projets et démonstrations",
    description: "Cas d'application des 7 leviers numériques officiels de DTSC.",
    href: "/projets",
    category: "Projets",
  },
  {
    title: "Ressources DTSC",
    description: "Articles, guides, annonces, veille data et IA, cas pratiques et contenus publics publiés par DTSC.",
    href: "/ressources",
    category: "Ressources",
  },
  {
    title: "À propos de DTSC",
    description: "Vision, mission, méthode et positionnement de DTSC autour des 7 leviers numériques.",
    href: "/a-propos",
    category: "Entreprise",
  },
  {
    title: "Contact DTSC",
    description: "Contact, consultation et cadrage d'un besoin autour des 7 leviers DTSC.",
    href: "/contact",
    category: "Contact",
  },
  {
    title: "Data en Afrique",
    description: "Structuration des données, gouvernance, maturité numérique et prise de décision dans le contexte africain.",
    href: "/data-afrique",
    category: "Ressources",
  },
  {
    title: "BI et KPI",
    description: "Levier Data & BI: indicateurs utiles, tableaux de bord, reporting et pilotage par la donnée.",
    href: "/bi-kpi",
    category: "Ressources",
  },
  {
    title: "IA en entreprise",
    description: "Levier Intelligence artificielle: assistants, modèles prédictifs, automatisation intelligente et validation humaine.",
    href: "/ia-entreprise",
    category: "Ressources",
  },
  {
    title: "Conditions d'utilisation",
    description: "Règles d'utilisation de DTSC Platform, responsabilités et conditions de service.",
    href: "/conditions-utilisation",
    category: "Conditions",
  },
  {
    title: "Politique de confidentialité",
    description: "Traitement des données, droits des utilisateurs, confidentialité et principes RGPD.",
    href: "/politique-confidentialite",
    category: "Confidentialité",
  },
  {
    title: "Politique des cookies",
    description: "Cookies essentiels, stockage local, PWA, statistiques publiques et gestion des préférences.",
    href: "/politique-cookies",
    category: "Cookies",
  },
];

export function normalizePublicSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
