export const dtsc = {
  name: "DTSC",
  fullName: "Data and Tech Solutions Consulting",
  slogan: "Le numérique au service de votre performance",
  location: "Kinshasa, RDC",
  website: "dtsc-platform.com",
  email: process.env.DTSC_CONTACT_EMAIL || "contact@dtsc-platform.com",
  whatsapp: "+243971935917",
  socialHandle: "Facebook (dtsc-platform) | Instagram (dtsc.platform) | X (dtscplatform)",
  copyright: "© 2026 DTSC — Data and Tech Solutions Consulting. Tous droits réservés.",
  summary:
    "DTSC est un cabinet basé à Kinshasa qui aide les organisations à booster leur performance avec 7 leviers numériques: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
  vision: "Devenir un leader africain de la performance mesurable par les 7 leviers numériques DTSC.",
  mission:
    "Aider les entreprises à améliorer leur performance, réduire leurs coûts et accroître leur visibilité grâce aux 7 leviers numériques DTSC.",
  targets: ["Assurances", "Cliniques", "Pharmacies", "PME"],
  services: [
    "Data & BI",
    "Intelligence artificielle",
    "Solutions digitales",
    "Audit & optimisation",
    "Formations",
    "Marketing digital",
    "Imprimerie numérique",
  ],
  businessModel:
    "Un accompagnement flexible autour des 7 leviers numériques officiels, avec cadrage, exécution, formation et suivi des gains mesurables.",
  organizationRoles: [
    { title: "Chief Executive Officer — CEO", mission: "Définit la vision stratégique, représente DTSC et supervise les objectifs globaux." },
    { title: "Chief Operations Officer — COO", mission: "Transforme la stratégie en actions concrètes et coordonne l'exécution." },
    { title: "Chief Technical Officer — CTO", mission: "Pilote la stratégie technologique, la sécurité et l'évolutivité des solutions." },
    { title: "Human Resources and Chief Financial Officer — HR & CFO", mission: "Assure la gestion administrative, financière et humaine." },
    { title: "Legal Advisor — LA", mission: "Sécurise les contrats, la conformité et les engagements de DTSC." },
    { title: "Management & Projects Officer — MPO", mission: "Cadre, suit et coordonne les projets numériques." },
    { title: "Supply Chain Officer — SCO", mission: "Gère les achats, fournisseurs, stocks, actifs et besoins logistiques." },
  ],
  advantages: [
    "Décisions guidées par des indicateurs fiables",
    "Optimisation des coûts et des processus",
    "Gains de temps mesurables grâce aux outils et à l'IA",
    "Meilleure visibilité et communication digitale",
    "Suivi opérationnel orienté KPI et adoption",
  ],
};

export const defaultAdmin = {
  email: process.env.DEFAULT_ADMIN_EMAIL || process.env.ADMIN_EMAIL,
  password: process.env.DEFAULT_ADMIN_PASSWORD,
};
