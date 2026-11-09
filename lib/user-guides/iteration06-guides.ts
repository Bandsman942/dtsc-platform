import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

export type Iteration06GuideCode =
  | "FINANCE_BUDGETS"
  | "BUDGET_VERSIONS_AND_SCENARIOS"
  | "BUDGET_TRACKING"
  | "REPORTS"
  | "REPORT_FILTERS_AND_EXPORTS"
  | "ENTERPRISE_ADMINISTRATION"
  | "COLLABORATORS_AND_POSITIONS"
  | "DEPARTMENTS"
  | "ROLES_AND_PERMISSIONS"
  | "MODULES_AND_SUBSCRIPTION"
  | "ENTERPRISE_SETTINGS_AND_BRANDING"
  | "ENTERPRISE_SECURITY"
  | "ENTERPRISE_AUDIT_LOGS";

type GuideSeed = {
  fr: { title: string; summary: string; audience: string; capabilities: string[]; steps: Array<[string, string]>; limitations?: string[] };
  en: { title: string; summary: string; audience: string; capabilities: string[]; steps: Array<[string, string]>; limitations?: string[] };
};

const seeds: Record<Iteration06GuideCode, GuideSeed> = {
  FINANCE_BUDGETS: {
    fr: {
      title: "Guide Budgets, dépenses et règlements",
      summary: "Distinguer autorisation budgétaire, charge comptable, dette et sortie réelle de trésorerie.",
      audience: "Responsables budgétaires, gérants, validateurs, comptables et trésoriers autorisés",
      capabilities: ["Comptes comptables par ligne", "Financement prévisionnel non débitant", "Dépenses de plusieurs natures", "Validation commune", "Écriture unique", "Règlements partiels contrôlés"],
      steps: [
        ["Configurer les comptes", "Dans Comptabilité et Trésorerie, configurez le plan comptable, les journaux, les comptes financiers et, pour les espèces, une session de caisse ouverte."],
        ["Créer le budget", "Pour chaque ligne, renseignez le montant, le compte d’imputation comptable et, si utile, le compte financier envisagé. Valider le budget ne déplace aucun argent."],
        ["Créer et faire approuver la dépense", "Indiquez sa nature, sa boutique, sa ligne budgétaire, son justificatif et, selon le cas, son fournisseur ou son collaborateur. Cette étape consomme l’enveloppe, mais ne paie personne."],
        ["Comptabiliser sans doublon", "Pour les charges directes approuvées, un titulaire du droit de comptabilisation enregistre une seule écriture. Pour une facture fournisseur, utilisez Dettes fournisseurs ; pour le stock, les actifs et les taxes, utilisez le circuit métier adapté."],
        ["Préparer le règlement", "Depuis la fiche d’une charge directe comptabilisée, créez un ordre de paiement total ou partiel. Le compte financier définitif est choisi à cette étape ; les ordres en attente réservent le solde à payer."],
        ["Faire valider et confirmer le paiement", "Dans Paiements, appliquez les permissions et la séparation des tâches. Seule la confirmation comptabilise le règlement et diminue le solde financier ; une annulation ou une contrepassation garde ses preuves."],
        ["Suivre et exporter", "Comparez budget engagé/réalisé, charge comptabilisée, règlements en attente et paiements confirmés sans mélanger ces montants."],
      ],
      limitations: ["Un budget est une autorisation, pas une provision de liquidités.", "La comptabilisation d’une charge et sa liquidation peuvent avoir des dates différentes.", "Une facture fournisseur ne doit jamais être imputée deux fois via une dépense directe.", "Un paiement brouillon ou approuvé n’est pas encore un mouvement de trésorerie."],
    },
    en: {
      title: "Budgets, expenses and settlement guide",
      summary: "Understand the difference between budget authorization, expense accounting, payables and actual cash outflows.",
      audience: "Budget owners, store managers, approvers, accountants and authorized treasury staff",
      capabilities: ["Ledger allocation per budget line", "Non-debiting planned funding", "Multi-category expenses", "Approval workflow", "Single posting", "Controlled partial settlements"],
      steps: [
        ["Configure the accounts", "Set up ledger accounts, journals and financial accounts in Accounting and Treasury; cash payments also require an open cash session."],
        ["Create the budget", "For each line, select the amount, expense ledger account and optional preferred funding account. Approval never moves cash."],
        ["Create and approve the expense", "Enter its nature, store, budget line, evidence and supplier or employee as appropriate. Approval consumes budget but pays no one."],
        ["Post without duplication", "Authorized Finance users post direct expenses once. Supplier invoices belong in Payables; inventory, fixed assets and taxes have dedicated workflows."],
        ["Prepare settlement", "Create a full or partial payment order from a posted direct expense. Select the actual financial account now; pending orders reserve the remaining payable amount."],
        ["Approve and confirm the payment", "Use the Payments module with separation of duties. Only confirmation posts settlement and reduces available cash; reversals preserve the trail."],
        ["Track and export", "Keep committed/actual budget, posted charges, pending payments and confirmed payments distinct."],
      ],
      limitations: ["A budget is an authorization, not cash on hand.", "Expense posting and payment may happen on different dates.", "Never post a supplier charge twice.", "Draft or approved payments do not move funds."],
    },
  },
  BUDGET_VERSIONS_AND_SCENARIOS: {
    fr: { title: "Guide Versions et scénarios budgétaires", summary: "Comparer des hypothèses cohérentes et conserver chaque révision approuvée.", audience: "Responsables budgétaires et validateurs", capabilities: ["BASE, prudent, optimiste et personnalisé", "Comparaison version à version", "Hypothèses documentées", "Historique immuable"], steps: [["Créer un scénario", "Définissez une hypothèse comparable sur le même périmètre, la même période et la même devise."], ["Comparer", "Vérifiez les différences de lignes, prévisions et hypothèses avant la soumission."], ["Créer une révision", "Utilisez l’action de révision pour cloner la version active et conserver la filiation."], ["Activer", "Seule une version validée peut remplacer la version active selon le workflow autorisé."]] },
    en: { title: "Budget versions and scenarios guide", summary: "Compare consistent assumptions and preserve every approved revision.", audience: "Budget owners and approvers", capabilities: ["Base, conservative, optimistic and custom", "Version comparison", "Documented assumptions", "Immutable history"], steps: [["Create a scenario", "Define a comparable assumption on the same scope, period and currency."], ["Compare", "Review line, forecast and assumption differences before submission."], ["Create a revision", "Use the revision action to clone the active version and preserve lineage."], ["Activate", "Only an approved version can replace the active version through the authorized workflow."]] },
  },
  BUDGET_TRACKING: {
    fr: { title: "Guide du suivi budgétaire", summary: "Comprendre budget, engagé, réalisé, disponible, prévision, écart et alertes.", audience: "Responsables financiers, opérationnels et budgétaires", capabilities: ["Sources ERP traçables", "Formules centralisées", "Drill-down autorisé", "Alertes dédupliquées", "Fraîcheur visible"], steps: [["Lire les montants", "Vérifiez la définition, la période, la devise et la date de fraîcheur avant toute comparaison."], ["Ouvrir la source", "Utilisez le lien profond pour consulter les écritures, achats, dépenses ou autres objets autorisés."], ["Traiter un écart", "Analysez l’écart et la prévision ; une proposition IA reste une hypothèse."], ["Clôturer une alerte", "Une alerte disparaît ou se clôt selon la règle lorsque sa condition n’est plus vraie."]] },
    en: { title: "Budget tracking guide", summary: "Understand budget, commitment, actual, available, forecast, variance and alerts.", audience: "Finance, operations and budget managers", capabilities: ["Traceable ERP sources", "Centralized formulas", "Authorized drill-down", "Deduplicated alerts", "Visible freshness"], steps: [["Read amounts", "Check definition, period, currency and freshness before comparing values."], ["Open the source", "Use deep links to inspect authorized entries, purchases, expenses or other source objects."], ["Handle a variance", "Analyze variance and forecast; an AI proposal remains an assumption."], ["Close an alert", "An alert closes or clears according to policy when its condition is no longer true."]] },
  },
  REPORTS: {
    fr: { title: "Guide Rapports et indicateurs", summary: "Exécuter des rapports fondés sur des métriques définies, des sources réelles et une fraîcheur visible.", audience: "Décideurs et utilisateurs autorisés aux rapports", capabilities: ["Catalogue canonique", "Définitions d’indicateurs", "Filtres et dimensions", "Graphiques accessibles", "Détails et sources"], steps: [["Choisir un rapport", "Consultez sa famille, ses permissions, son unité, sa source et sa fraîcheur."], ["Appliquer les filtres", "Définissez période, département, projet, devise ou autres dimensions supportées."], ["Lire la visualisation", "Contrôlez la légende et l’alternative tabulaire ; une valeur absente n’est pas transformée en zéro."], ["Ouvrir le détail", "Le drill-down n’affiche que les données sources autorisées."]] },
    en: { title: "Reports and metrics guide", summary: "Run reports based on defined metrics, real sources and visible freshness.", audience: "Decision makers and authorized report users", capabilities: ["Canonical catalog", "Metric definitions", "Filters and dimensions", "Accessible charts", "Details and sources"], steps: [["Choose a report", "Review its family, permissions, unit, source and freshness."], ["Apply filters", "Set period, department, project, currency or other supported dimensions."], ["Read the visualization", "Check the legend and table alternative; missing data is not converted into zero."], ["Open details", "Drill-down only exposes authorized source data."]] },
  },
  REPORT_FILTERS_AND_EXPORTS: {
    fr: { title: "Guide Filtres, vues et exports", summary: "Enregistrer des vues personnelles, gérer les favoris et exporter les mêmes valeurs que l’écran.", audience: "Utilisateurs des rapports", capabilities: ["Vues persistées", "Favoris personnels", "Filtres conservés", "CSV localisé", "Diffusion contrôlée"], steps: [["Configurer une vue", "Choisissez les filtres et dimensions, puis donnez un nom à la vue."], ["Définir par défaut", "Une vue personnelle peut devenir votre vue par défaut sans modifier les autres utilisateurs."], ["Exporter", "L’export reprend la formule, les filtres, l’unité, la devise et la date de génération."], ["Partager", "Une vue ou diffusion partagée nécessite une permission explicite."]] },
    en: { title: "Filters, views and exports guide", summary: "Save personal views, manage favorites and export the same values shown on screen.", audience: "Report users", capabilities: ["Persistent views", "Personal favorites", "Retained filters", "Localized CSV", "Controlled distribution"], steps: [["Configure a view", "Choose filters and dimensions, then name the view."], ["Set as default", "A personal view can become your default without affecting other users."], ["Export", "Exports reuse the same formula, filters, unit, currency and generation date."], ["Share", "A shared view or delivery requires explicit permission."]] },
  },
  ENTERPRISE_ADMINISTRATION: {
    fr: { title: "Guide Administration de l’entreprise", summary: "Configurer l’organisation, les collaborateurs, rôles, modules, paramètres, sécurité et audit dans un tenant isolé.", audience: "Administrateurs d’entreprise autorisés", capabilities: ["Checklist réelle", "Administration tenant-scoped", "RBAC serveur", "Modules et entitlements", "Sécurité et audit"], steps: [["Vérifier la checklist", "Chaque état correspond à un contrôle persistant et ouvre la section concernée."], ["Structurer l’organisation", "Configurez départements, postes, collaborateurs et responsables."], ["Attribuer les accès", "Utilisez les rôles et permissions, puis simulez une décision avant de modifier un accès critique."], ["Contrôler", "Consultez les actions administratives et les événements de sécurité dans l’audit."]] },
    en: { title: "Enterprise administration guide", summary: "Configure organization, collaborators, roles, modules, settings, security and audit in an isolated tenant.", audience: "Authorized enterprise administrators", capabilities: ["Real checklist", "Tenant-scoped administration", "Server RBAC", "Modules and entitlements", "Security and audit"], steps: [["Review the checklist", "Each state comes from a persistent control and opens the relevant section."], ["Structure the organization", "Configure departments, positions, collaborators and managers."], ["Assign access", "Use roles and permissions, then simulate a decision before changing critical access."], ["Control", "Review administrative actions and security events in the audit log."]] },
  },
  COLLABORATORS_AND_POSITIONS: {
    fr: { title: "Guide Collaborateurs et postes", summary: "Inviter, rattacher et retirer des collaborateurs sans supprimer leur compte global ni l’historique.", audience: "Administrateurs et responsables RH autorisés", capabilities: ["Invitations avec acceptation", "Postes officiels", "Responsables et départements", "Suspension et retrait", "Réaffectation des responsabilités"], steps: [["Inviter", "Invitez un utilisateur existant et laissez-le accepter avant son intégration."], ["Affecter", "Choisissez poste, département, responsable et rôles autorisés."], ["Modifier", "Toute modification recalcule les capacités effectives et produit un audit."], ["Retirer", "Réaffectez les responsabilités, puis retirez le membership sans supprimer l’utilisateur global."]] },
    en: { title: "Collaborators and positions guide", summary: "Invite, assign and remove collaborators without deleting their global account or history.", audience: "Authorized administrators and HR managers", capabilities: ["Accepted invitations", "Official positions", "Managers and departments", "Suspension and removal", "Responsibility reassignment"], steps: [["Invite", "Invite an existing user and let them accept before membership is activated."], ["Assign", "Choose position, department, manager and authorized roles."], ["Modify", "Every change recalculates effective capabilities and creates an audit event."], ["Remove", "Reassign responsibilities, then remove membership without deleting the global user."]] },
  },
  DEPARTMENTS: {
    fr: { title: "Guide Départements", summary: "Construire une hiérarchie sans cycle et archiver les structures utilisées sans perte d’historique.", audience: "Administrateurs d’entreprise", capabilities: ["Racines et sous-départements", "Responsables", "Détection de cycle", "Archivage", "Transfert contrôlé"], steps: [["Créer", "Renseignez code, nom, description, responsable et parent éventuel."], ["Déplacer", "Choisissez un nouveau parent ; le serveur refuse tout cycle hiérarchique."], ["Archiver", "Un département utilisé est archivé plutôt que supprimé brutalement."], ["Transférer", "Réaffectez membres, postes et responsabilités avant la clôture."]] },
    en: { title: "Departments guide", summary: "Build an acyclic hierarchy and archive used structures without losing history.", audience: "Enterprise administrators", capabilities: ["Root and child departments", "Managers", "Cycle detection", "Archiving", "Controlled transfer"], steps: [["Create", "Enter code, name, description, manager and optional parent."], ["Move", "Choose a new parent; the server rejects hierarchy cycles."], ["Archive", "A used department is archived instead of being deleted abruptly."], ["Transfer", "Reassign members, positions and responsibilities before closure."]] },
  },
  ROLES_AND_PERMISSIONS: {
    fr: { title: "Guide Rôles et permissions", summary: "Créer des rôles d’organisation, expliquer l’héritage et vérifier la décision finale côté serveur.", audience: "Administrateurs habilités à gérer les accès", capabilities: ["Rôles système protégés", "Rôles personnalisés", "Permissions directes et héritées", "Simulation", "Protection du dernier administrateur"], steps: [["Créer un rôle", "Définissez un code, un libellé et une liste minimale de permissions nécessaires."], ["Affecter", "Attribuez le rôle à un membership actif de la même organisation."], ["Simuler", "Testez module et action pour obtenir décision, origine et reason code sans mutation."], ["Protéger", "Le serveur refuse la suppression du dernier accès administratif critique."]] },
    en: { title: "Roles and permissions guide", summary: "Create organization roles, explain inheritance and verify final server decisions.", audience: "Administrators authorized to manage access", capabilities: ["Protected system roles", "Custom roles", "Direct and inherited permissions", "Simulation", "Last administrator protection"], steps: [["Create a role", "Define a code, label and the minimum necessary permission set."], ["Assign", "Assign the role to an active membership in the same organization."], ["Simulate", "Test a module and action to obtain decision, origin and reason code without mutation."], ["Protect", "The server refuses removal of the last critical administrative access."]] },
  },
  MODULES_AND_SUBSCRIPTION: {
    fr: { title: "Guide Modules et abonnement", summary: "Comprendre plan, entitlements, dépendances, capacités et raisons d’indisponibilité.", audience: "Administrateurs d’entreprise", capabilities: ["Plan et consommation", "Activation contrôlée", "Dépendances", "Désactivation non destructive", "Guide par module"], steps: [["Consulter", "Vérifiez le plan requis, le statut technique, la maturité, les capacités et les limites."], ["Activer", "Le serveur contrôle plan, abonnement, dépendances, configuration et disponibilité réelle."], ["Désactiver", "Lisez les impacts ; les données sont conservées et les nouvelles mutations sont bloquées selon la politique."], ["Ouvrir le guide", "Utilisez le guide natif du module pour comprendre les parcours disponibles."]] },
    en: { title: "Modules and subscription guide", summary: "Understand plan, entitlements, dependencies, capabilities and unavailability reasons.", audience: "Enterprise administrators", capabilities: ["Plan and usage", "Controlled activation", "Dependencies", "Non-destructive deactivation", "Per-module guide"], steps: [["Review", "Check required plan, technical status, maturity, capabilities and limits."], ["Activate", "The server validates plan, subscription, dependencies, configuration and real availability."], ["Deactivate", "Review impacts; data is preserved and new mutations are blocked according to policy."], ["Open the guide", "Use the native module guide to understand available workflows."]] },
  },
  ENTERPRISE_SETTINGS_AND_BRANDING: {
    fr: { title: "Guide Paramètres et identité visuelle", summary: "Appliquer réellement locale, fuseau, devise, formats, exercice et branding autorisé.", audience: "Administrateurs d’entreprise", capabilities: ["Logo et couleurs", "Locale et fuseau", "Devise et formats", "Exercice", "Validation et aperçu"], steps: [["Modifier le branding", "Téléversez un fichier autorisé et contrôlez la prévisualisation et le contraste."], ["Configurer la localisation", "Choisissez langue, fuseau horaire, formats de date et de nombres."], ["Configurer la finance", "Définissez devise principale et début d’exercice selon la politique de l’organisation."], ["Vérifier", "Actualisez l’application et confirmez que chaque réglage a un effet réel."]] },
    en: { title: "Settings and branding guide", summary: "Actually apply locale, timezone, currency, formats, fiscal year and authorized branding.", audience: "Enterprise administrators", capabilities: ["Logo and colors", "Locale and timezone", "Currency and formats", "Fiscal year", "Validation and preview"], steps: [["Change branding", "Upload an authorized file and review preview and contrast."], ["Configure localization", "Choose language, timezone, date and number formats."], ["Configure finance", "Set the main currency and fiscal year start according to organization policy."], ["Verify", "Reload the application and confirm every setting has a real effect."]] },
  },
  ENTERPRISE_SECURITY: {
    fr: { title: "Guide Sécurité de l’entreprise", summary: "Définir sessions, invitations, domaines, MFA disponible et politique d’export sans contournement.", audience: "Administrateurs de sécurité autorisés", capabilities: ["Inactivité de session", "Domaines autorisés", "Politique d’invitation", "Exports sensibles", "Audit critique"], steps: [["Définir les sessions", "Choisissez une durée d’inactivité cohérente avec le risque de l’organisation."], ["Limiter les invitations", "Configurez expiration, rôle par défaut, quantité et domaines autorisés."], ["Protéger les exports", "Exigez une approbation pour les exports sensibles lorsque la politique le prévoit."], ["Contrôler", "Toute modification de politique est auditée avec avant, après et reason code."]] },
    en: { title: "Enterprise security guide", summary: "Define sessions, invitations, domains, available MFA and export policy without bypasses.", audience: "Authorized security administrators", capabilities: ["Session inactivity", "Allowed domains", "Invitation policy", "Sensitive exports", "Critical audit"], steps: [["Define sessions", "Choose an inactivity duration appropriate to organization risk."], ["Limit invitations", "Configure expiry, default role, volume and allowed domains."], ["Protect exports", "Require approval for sensitive exports when policy demands it."], ["Control", "Every policy change is audited with before, after and reason code."]] },
  },
  ENTERPRISE_AUDIT_LOGS: {
    fr: { title: "Guide Journaux d’audit", summary: "Rechercher, comprendre et exporter les changements administratifs sans exposer de secrets.", audience: "Administrateurs et auditeurs autorisés", capabilities: ["Filtres", "Avant et après", "Reason codes", "Corrélation", "Export protégé"], steps: [["Filtrer", "Choisissez période, acteur, action, objet, résultat, risque ou reason code."], ["Lire le détail", "Examinez contexte, ancien état, nouvel état, résultat et corrélation autorisée."], ["Protéger les secrets", "Les mots de passe, OTP, tokens et données de carte ne doivent jamais apparaître."], ["Exporter", "L’export est limité, horodaté, localisé et lui-même audité."]] },
    en: { title: "Audit logs guide", summary: "Search, understand and export administrative changes without exposing secrets.", audience: "Authorized administrators and auditors", capabilities: ["Filters", "Before and after", "Reason codes", "Correlation", "Protected export"], steps: [["Filter", "Choose period, actor, action, object, result, risk or reason code."], ["Read details", "Review context, old state, new state, result and authorized correlation metadata."], ["Protect secrets", "Passwords, OTPs, tokens and card data must never appear."], ["Export", "Exports are limited, timestamped, localized and audited themselves."]] },
  },
};

function buildGuide(code: Iteration06GuideCode, locale: "fr" | "en"): ContextualUserGuide {
  const seed = seeds[code][locale];
  return {
    code,
    title: seed.title,
    summary: seed.summary,
    audience: seed.audience,
    updatedAt: code === "FINANCE_BUDGETS" ? "2026-11-09" : "2026-08-05",
    capabilities: seed.capabilities,
    steps: seed.steps.map(([title, description]) => ({ title, description })),
    limitations: seed.limitations,
  };
}

export function getIteration06UserGuide(code: Iteration06GuideCode, locale?: string | null) {
  return buildGuide(code, locale === "en" ? "en" : "fr");
}

export const ITERATION06_USER_GUIDE_CODES = Object.keys(seeds) as Iteration06GuideCode[];
