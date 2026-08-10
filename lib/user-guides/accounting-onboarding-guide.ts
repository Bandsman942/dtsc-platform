import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

const FR: ContextualUserGuide = {
  code: "FINANCE_ACCOUNTING_ONBOARDING",
  title: "Guide de mise en service comptable",
  summary: "Démarrer avec le plan SYSCOHADA officiel par défaut de DTSC, suivre l’assistant de mise en service piloté par le serveur, corriger les blocages puis activer la comptabilité.",
  audience: "Administrateurs d’entreprise, responsables Finance et comptables autorisés",
  updatedAt: "2026-08-09",
  capabilities: [
    "SYSCOHADA révisé 2017 v0.1.0 comme plan officiel par défaut DTSC",
    "Assistant Finance calculé par les diagnostics serveur",
    "Cases automatiquement validées après configuration réelle",
    "Filiation version → plan entreprise traçable",
    "Sous-comptes personnalisés contrôlés",
    "Mappings métier vers comptes actifs",
    "Journaux recommandés et personnalisables",
    "Distinction entre blocages obligatoires et recommandations contextuelles",
    "Activation explicite et auditée",
    "États financiers versionnés",
    "Diff de version sans mutation silencieuse",
  ],
  steps: [
    { title: "Ouvrir la Vue d’ensemble financière", description: "L’assistant affiche les prérequis calculés par le serveur. Une étape devient terminée automatiquement dès que la configuration correspondante est réellement valide." },
    { title: "Configurer les devises", description: "Définissez la devise fonctionnelle. La devise de présentation utilise la devise fonctionnelle si aucune devise distincte n’est nécessaire." },
    { title: "Créer l’exercice et la période", description: "Créez l’exercice financier puis au moins une période comptable ouverte correspondant au calendrier réel de l’entreprise." },
    { title: "Confirmer la version du plan", description: "DTSC sélectionne SYSCOHADA révisé 2017 v0.1.0 par défaut. Vérifiez la juridiction, la date d’effet et la version affichée avant de l’appliquer au plan de l’entreprise.", cautions: ["Une nouvelle version n’est jamais appliquée automatiquement à un plan déjà utilisé."] },
    { title: "Créer et appliquer le plan entreprise", description: "Créez le plan propre à votre entreprise puis appliquez la version. Les comptes, mappings métier et journaux sont copiés dans le contexte isolé de l’entreprise avec une filiation code@version." },
    { title: "Personnaliser", description: "Ajoutez des sous-comptes autorisés sous un compte parent. Les comptes système et les comptes déjà utilisés restent protégés." },
    { title: "Vérifier les mappings et journaux", description: "Chaque opération ERP doit trouver le compte actif approprié à sa date comptable et le journal requis. DTSC n’utilise pas de fallback silencieux." },
    { title: "Traiter les recommandations", description: "Configurez les comptes financiers, la fiscalité applicable et la tolérance de rapprochement selon le contexte réel. Une recommandation non applicable ne bloque pas automatiquement la comptabilisation." },
    { title: "Corriger les blocages", description: "Traitez chaque point marqué Requis. Les messages et liens d’action sont fournis par le même contrat serveur que celui utilisé par le posting." },
    { title: "Activer", description: "Lorsque les contrôles bloquants sont satisfaits, activez explicitement le plan. L’action est auditée et protégée par les permissions serveur." },
    { title: "Consulter les états", description: "Utilisez la balance, le grand livre, le bilan et le compte de résultat. Chaque montant reste traçable vers les comptes et écritures comptabilisées." },
    { title: "Importer une nouvelle version", description: "Une nouvelle version officielle est enregistrée séparément. Prévisualisez toujours le diff et l’impact avant toute migration. Les écritures historiques ne sont jamais réécrites." },
  ],
  limitations: [
    "Les règles fiscales nationales variables ne sont pas intégrées au plan SYSCOHADA commun ; elles appartiennent à la configuration fiscale ou à un overlay pays sourcé.",
    "Une migration complexe d’un plan déjà utilisé exige une analyse d’impact et une validation contrôlée ; DTSC bloque l’application automatique plutôt que de modifier l’historique.",
  ],
};

const EN: ContextualUserGuide = {
  code: "FINANCE_ACCOUNTING_ONBOARDING",
  title: "Accounting onboarding guide",
  summary: "Start with DTSC’s official default SYSCOHADA chart, follow the server-driven setup assistant, resolve blockers, then activate accounting.",
  audience: "Enterprise administrators, Finance owners and authorized accountants",
  updatedAt: "2026-08-09",
  capabilities: [
    "Revised SYSCOHADA 2017 v0.1.0 as the DTSC official default chart",
    "Finance assistant calculated from server diagnostics",
    "Automatically checked steps after real configuration",
    "Traceable version → company chart lineage",
    "Controlled custom child accounts",
    "Business semantic mappings to active accounts",
    "Recommended and customizable journals",
    "Explicit distinction between blocking prerequisites and contextual recommendations",
    "Explicit audited activation",
    "Versioned financial statements",
    "Version diff without silent mutation",
  ],
  steps: [
    { title: "Open Finance overview", description: "The assistant displays prerequisites calculated by the server. A step becomes complete automatically as soon as the corresponding configuration is truly valid." },
    { title: "Configure currencies", description: "Set the functional currency. Presentation currency uses the functional currency when a separate presentation currency is not needed." },
    { title: "Create fiscal year and period", description: "Create the fiscal year and at least one open accounting period matching the company’s real accounting calendar." },
    { title: "Confirm the chart version", description: "DTSC selects Revised SYSCOHADA 2017 v0.1.0 by default. Review jurisdiction, effective date and displayed version before applying it to the company chart.", cautions: ["A new version is never applied automatically to a chart that is already in use."] },
    { title: "Create and apply the company chart", description: "Create the company chart, then apply the version. Accounts, business mappings and journals are copied into the isolated company context while retaining code@version lineage." },
    { title: "Customize", description: "Add authorized child accounts below a parent account. System and already-used accounts remain protected." },
    { title: "Review mappings and journals", description: "Every ERP operation must resolve to the appropriate active account at its accounting date and to the required journal. DTSC does not silently fall back." },
    { title: "Handle recommendations", description: "Configure financial accounts, applicable tax setup and reconciliation tolerance for the real company context. A recommendation that does not apply does not automatically block posting." },
    { title: "Resolve blockers", description: "Address each item marked Required. Action messages and links come from the same server contract used by posting." },
    { title: "Activate", description: "When blocking controls are satisfied, explicitly activate the chart. The action is audited and protected by server permissions." },
    { title: "Read statements", description: "Use trial balance, general ledger, balance sheet and income statement. Each amount remains traceable to accounts and posted entries." },
    { title: "Import a new version", description: "A new official version is registered separately. Always preview the diff and impact before migration. Historical entries are never rewritten." },
  ],
  limitations: [
    "Variable national tax rules are not embedded in the common SYSCOHADA chart; they belong in tax configuration or a sourced country overlay.",
    "A complex migration of an already-used chart requires impact analysis and controlled approval; DTSC blocks automatic application rather than rewriting history.",
  ],
};

export function getAccountingOnboardingGuide(locale?: string | null) {
  return locale === "en" ? EN : FR;
}
