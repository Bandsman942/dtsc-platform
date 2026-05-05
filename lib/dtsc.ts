export const dtsc = {
  name: "DTSC",
  fullName: "Data and Tech Solutions Consulting",
  slogan: "Le numérique au service de votre performance",
  location: "Kinshasa, RDC",
  website: "dtsc-platform.com",
  email: process.env.DTSC_CONTACT_EMAIL || "contact@dtsc-platform.com",
  whatsapp: "+243971935917",
  socialHandle: "@dtsc-platform",
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
  advantages: [
    "Pilotage par les indicateurs clés",
    "Réduction des coûts opérationnels",
    "Automatisation des processus métier",
    "Visibilité marketing renforcée",
    "Accompagnement conseil et exécution structurée",
  ],
};

export const defaultAdmin = {
  email: process.env.DEFAULT_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@dtsc-platform.com",
  password: process.env.DEFAULT_ADMIN_PASSWORD || "DtscAdmin2026!",
};
