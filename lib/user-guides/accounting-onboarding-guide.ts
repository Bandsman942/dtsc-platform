import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

const FR: ContextualUserGuide = {
  code: "FINANCE_ACCOUNTING_ONBOARDING",
  title: "Guide de mise en service comptable",
  summary: "Adopter un référentiel versionné, personnaliser le plan sans casser le template, configurer journaux et mappings, corriger les blocages puis activer la comptabilité.",
  audience: "Administrateurs d’entreprise, responsables Finance et comptables autorisés",
  updatedAt: "2026-08-09",
  capabilities: [
    "Choix d’un template comptable versionné",
    "Filiation template → plan entreprise traçable",
    "Sous-comptes personnalisés contrôlés",
    "Mappings métier vers comptes actifs",
    "Journaux recommandés et personnalisables",
    "Readiness avec blocages et actions correctives",
    "Activation explicite et auditée",
    "Diff de version sans mutation silencieuse",
    "Séparation reporting de gestion / reporting réglementaire",
  ],
  steps: [
    { title: "Choisir le référentiel", description: "Sélectionnez le framework et le template correspondant au contexte de l’entreprise, puis vérifiez la juridiction, la date d’effet et la provenance affichées.", cautions: ["Le bootstrap SYSCOHADA 2017 v0.1.0 est non officiel : il ne constitue pas une déclaration de conformité réglementaire."] },
    { title: "Créer le plan entreprise", description: "Créez un plan propre au tenant. Le template reste immuable et sert uniquement de source versionnée." },
    { title: "Adopter le template", description: "L’adoption copie les comptes, mappings et journaux du template dans le contexte isolé de l’entreprise et conserve la référence code@version." },
    { title: "Personnaliser", description: "Ajoutez uniquement des sous-comptes autorisés sous un compte parent. Les comptes système et les comptes déjà utilisés sont protégés." },
    { title: "Configurer Finance", description: "Renseignez devise fonctionnelle, exercice, périodes, comptes de trésorerie, fiscalité applicable et autres paramètres réels de l’entreprise." },
    { title: "Vérifier les mappings", description: "Chaque clé métier de posting doit résoudre vers un compte actif du plan à la date de l’écriture. Aucun fallback silencieux n’est utilisé." },
    { title: "Corriger le readiness", description: "Traitez chaque blocage affiché. Les avertissements non bloquants restent visibles avec leur action corrective." },
    { title: "Activer", description: "Lorsque tous les contrôles bloquants sont verts, activez explicitement le plan. L’action est auditée et soumise au RBAC serveur." },
    { title: "Consulter les états", description: "Utilisez la balance, le grand livre et les états de gestion. Un état réglementaire n’est proposé que si des rubriques versionnées et validées existent dans le template." },
    { title: "Changer de version", description: "Prévisualisez toujours le diff. Une version utilisée par des écritures POSTED n’est jamais remplacée silencieusement et les écritures historiques ne sont jamais réécrites." },
  ],
  limitations: [
    "ACCOUNTING_TEMPLATE_PRODUCTION_READY reste bloqué pour OHADA_SYSCOHADA@0.1.0 tant qu’une source réglementaire suffisamment fiable, les rubriques d’états, la revue comptable et l’approbation humaine ne sont pas acquises.",
    "Les taux fiscaux et règles nationales ne sont pas stockés dans le template SYSCOHADA commun ; ils appartiennent à la configuration fiscale ou à un overlay pays sourcé.",
  ],
};

const EN: ContextualUserGuide = {
  code: "FINANCE_ACCOUNTING_ONBOARDING",
  title: "Accounting onboarding guide",
  summary: "Adopt a versioned framework, customize the company chart safely, configure journals and mappings, resolve blockers, then explicitly activate accounting.",
  audience: "Enterprise administrators, Finance owners and authorized accountants",
  updatedAt: "2026-08-09",
  capabilities: [
    "Versioned accounting template selection",
    "Traceable template → company chart lineage",
    "Controlled custom child accounts",
    "Business semantic mappings to active accounts",
    "Recommended and customizable journals",
    "Actionable readiness diagnostics",
    "Explicit audited activation",
    "Version diff without silent mutation",
    "Management / regulatory reporting separation",
  ],
  steps: [
    { title: "Choose the framework", description: "Select the framework and template that fit the company context, then review jurisdiction, effective date and displayed provenance.", cautions: ["SYSCOHADA 2017 bootstrap v0.1.0 is unofficial and is not a regulatory compliance declaration."] },
    { title: "Create the company chart", description: "Create a tenant-owned chart. The source template remains immutable and versioned." },
    { title: "Adopt the template", description: "Adoption copies accounts, semantic mappings and journals into the isolated company context while retaining the code@version reference." },
    { title: "Customize", description: "Add authorized child accounts below a parent account. System and already-used accounts remain protected." },
    { title: "Configure Finance", description: "Set functional currency, fiscal year, periods, treasury accounts, applicable tax configuration and the company’s real parameters." },
    { title: "Review mappings", description: "Every posting business key must resolve to an active chart account at the accounting date. No silent fallback is used." },
    { title: "Resolve readiness", description: "Address every displayed blocker. Non-blocking warnings remain visible with corrective guidance." },
    { title: "Activate", description: "When every blocking control is green, explicitly activate the chart. The action is audited and server-RBAC protected." },
    { title: "Read statements", description: "Use trial balance, general ledger and management statements. Regulatory statements are exposed only when versioned validated lines exist in the template." },
    { title: "Upgrade versions", description: "Always preview the diff. A version already used by POSTED entries is never silently replaced and historical entries are never rewritten." },
  ],
  limitations: [
    "ACCOUNTING_TEMPLATE_PRODUCTION_READY remains blocked for OHADA_SYSCOHADA@0.1.0 until an adequately trusted regulatory source, validated statement mappings, accounting review and human approval are available.",
    "National tax rates and volatile country rules are not embedded in the common SYSCOHADA template; they belong in tax configuration or a sourced country overlay.",
  ],
};

export function getAccountingOnboardingGuide(locale?: string | null) {
  return locale === "en" ? EN : FR;
}
