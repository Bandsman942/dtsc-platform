import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

const FR: ContextualUserGuide = {
  code: "FINANCE_ACCOUNTING_ONBOARDING",
  title: "Guide de mise en service comptable",
  summary: "Démarrer avec le plan SYSCOHADA officiel par défaut de DTSC, personnaliser le plan de l’entreprise, configurer journaux et mappings, corriger les blocages puis activer la comptabilité.",
  audience: "Administrateurs d’entreprise, responsables Finance et comptables autorisés",
  updatedAt: "2026-08-09",
  capabilities: [
    "SYSCOHADA révisé 2017 v0.1.0 comme plan officiel par défaut DTSC",
    "Filiation version → plan entreprise traçable",
    "Sous-comptes personnalisés contrôlés",
    "Mappings métier vers comptes actifs",
    "Journaux recommandés et personnalisables",
    "Diagnostic d’activation avec actions correctives",
    "Activation explicite et auditée",
    "États financiers versionnés",
    "Diff de version sans mutation silencieuse",
  ],
  steps: [
    { title: "Confirmer la version du plan", description: "DTSC sélectionne SYSCOHADA révisé 2017 v0.1.0 par défaut. Vérifiez la juridiction, la date d’effet et la version affichée avant de l’appliquer au plan de l’entreprise.", cautions: ["Une nouvelle version n’est jamais appliquée automatiquement à un plan déjà utilisé."] },
    { title: "Créer le plan entreprise", description: "Créez le plan propre à votre entreprise. La version source reste immuable et sert de référence traçable." },
    { title: "Appliquer la version", description: "L’application copie les comptes, mappings métier et journaux dans le contexte isolé de l’entreprise tout en conservant la référence code@version." },
    { title: "Personnaliser", description: "Ajoutez des sous-comptes autorisés sous un compte parent. Les comptes système et les comptes déjà utilisés restent protégés." },
    { title: "Configurer Finance", description: "Renseignez la devise fonctionnelle, l’exercice, les périodes, les comptes de trésorerie, la fiscalité applicable et les paramètres réels de l’entreprise." },
    { title: "Vérifier les mappings métier", description: "Chaque opération ERP doit trouver le compte actif approprié à sa date comptable. DTSC n’utilise pas de fallback silencieux vers un autre compte." },
    { title: "Corriger les blocages", description: "Traitez chaque point bloquant affiché. Les messages indiquent l’action métier à effectuer avant l’activation." },
    { title: "Activer", description: "Lorsque les contrôles bloquants sont satisfaits, activez explicitement le plan. L’action est auditée et protégée par les permissions serveur." },
    { title: "Consulter les états", description: "Utilisez la balance, le grand livre, le bilan et le compte de résultat. Les rubriques sont versionnées et chaque montant reste traçable vers les comptes et écritures comptabilisées." },
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
  summary: "Start with DTSC’s official default SYSCOHADA chart, customize the company chart safely, configure journals and mappings, resolve blockers, then activate accounting.",
  audience: "Enterprise administrators, Finance owners and authorized accountants",
  updatedAt: "2026-08-09",
  capabilities: [
    "Revised SYSCOHADA 2017 v0.1.0 as the DTSC official default chart",
    "Traceable version → company chart lineage",
    "Controlled custom child accounts",
    "Business semantic mappings to active accounts",
    "Recommended and customizable journals",
    "Actionable activation diagnostics",
    "Explicit audited activation",
    "Versioned financial statements",
    "Version diff without silent mutation",
  ],
  steps: [
    { title: "Confirm the chart version", description: "DTSC selects Revised SYSCOHADA 2017 v0.1.0 by default. Review the jurisdiction, effective date and displayed version before applying it to the company chart.", cautions: ["A new version is never applied automatically to a chart that is already in use."] },
    { title: "Create the company chart", description: "Create a company-owned chart. The source version remains immutable and provides traceable lineage." },
    { title: "Apply the version", description: "Applying the version copies accounts, business mappings and journals into the isolated company context while retaining the code@version reference." },
    { title: "Customize", description: "Add authorized child accounts below a parent account. System and already-used accounts remain protected." },
    { title: "Configure Finance", description: "Set functional currency, fiscal year, periods, treasury accounts, applicable tax configuration and the company’s real parameters." },
    { title: "Review business mappings", description: "Every ERP operation must resolve to the appropriate active account at its accounting date. DTSC does not silently fall back to another account." },
    { title: "Resolve blockers", description: "Address each blocking item shown. Messages explain the business action required before activation." },
    { title: "Activate", description: "When blocking controls are satisfied, explicitly activate the chart. The action is audited and protected by server permissions." },
    { title: "Read statements", description: "Use trial balance, general ledger, balance sheet and income statement. Statement lines are versioned and each amount remains traceable to accounts and posted entries." },
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
