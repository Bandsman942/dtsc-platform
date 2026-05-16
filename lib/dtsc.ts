export const dtsc = {
  name: "DTSC",
  fullName: "Data and Tech Solutions Consulting",
  slogan: "Le numérique au service de votre performance",
  location: "Kinshasa, RDC",
  website: "dtsc-platform.com",
  email: process.env.DTSC_CONTACT_EMAIL || "contact@dtsc-platform.com",
  whatsapp: "+243971935917",
  socialHandle: "Facebook: dtsc-platform, Instagram: dtsc.platform, X: @dtscplatform",
  copyright: "© 2026 DTSC — Data and Tech Solutions Consulting. Tous droits réservés.",
  summary:
    "DTSC est un cabinet innovant basé à Kinshasa, spécialisé dans la transformation digitale, la data, l'intelligence artificielle, le marketing digital et l'imprimerie numérique.",
  vision: "Devenir un leader africain en transformation digitale et data consulting.",
  mission:
    "Aider les entreprises à améliorer leur performance, réduire leurs coûts et accroître leur visibilité grâce aux technologies.",
  targets: ["Assurances", "Cliniques", "Pharmacies", "PME"],
  services: [
    "Data & BI: dashboards, KPI et reporting",
    "Formations en analyse des données",
    "Audit, optimisation, réduction des coûts et fraude",
    "Solutions digitales et développement d'applications",
    "IA: modèles prédictifs, chatbots et solutions basées sur l'IA",
    "Marketing digital et acquisition clients",
    "Imprimerie numérique et supports physiques",
  ],
  businessModel:
    "Un accompagnement flexible: conseil, solutions digitales, formations, marketing et outils numériques adaptés à vos priorités.",
  organizationRoles: [
    {
      title: "Chief Executive Officer — CEO",
      mission:
        "Définit la vision stratégique, représente DTSC auprès des partenaires et supervise les objectifs commerciaux, financiers et opérationnels.",
    },
    {
      title: "Chief Operations Officer — COO",
      mission:
        "Transforme la stratégie en actions concrètes, coordonne l'exécution des projets et veille à la discipline opérationnelle.",
    },
    {
      title: "Chief Technical Officer — CTO",
      mission:
        "Pilote la stratégie technologique, l'architecture, la qualité, la sécurité et l'évolutivité des solutions digitales, data et IA.",
    },
    {
      title: "Human Resources and Chief Financial Officer — HR & CFO",
      mission:
        "Assure la gestion administrative, financière et humaine: budgets, dépenses, factures, dossiers RH et stabilité interne.",
    },
    {
      title: "Legal Advisor — LA",
      mission:
        "Sécurise les contrats, accompagne la conformité, protège les intérêts juridiques et réduit les risques administratifs.",
    },
    {
      title: "Management & Projects Officer — MPO",
      mission:
        "Pilote le portefeuille des projets numériques, cadre les besoins, suit les cahiers de charges, livrables, risques et coordinations avec CTO, COO, HR & CFO, SCO et CEO.",
    },
    {
      title: "Supply Chain Officer — SCO",
      mission:
        "Gère les achats, ressources matérielles, fournisseurs, stocks, inventaire et logistique des formations, missions et événements.",
    },
  ],
  advantages: [
    "Décisions guidées par des indicateurs fiables",
    "Optimisation des coûts et des processus",
    "Automatisation des tâches répétitives et critiques",
    "Meilleure visibilité et communication digitale",
    "Conseil, mise en œuvre et suivi opérationnel",
  ],
};

export const defaultAdmin = {
  email: process.env.DEFAULT_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@dtsc-platform.com",
  password: process.env.DEFAULT_ADMIN_PASSWORD || "DtscAdmin2026!",
};
