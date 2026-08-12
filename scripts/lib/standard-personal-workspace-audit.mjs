import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function requireFile(errors, file) {
  if (!exists(file)) {
    errors.push(`Fichier requis absent: ${file}`);
    return "";
  }
  return read(file);
}

function expectTokens(errors, label, content, tokens) {
  for (const token of tokens) {
    if (!content.includes(token)) errors.push(`${label}: contrat absent ${token}`);
  }
}

export const STANDARD_PERSONAL_WORKSPACE_AUDIT_MODES = [
  "dashboard",
  "context",
  "subscription",
  "notification-deep-links",
  "notification-preferences",
  "invitations",
  "profile-settings",
  "sessions",
  "guides",
  "all",
];

export function runStandardPersonalWorkspaceAudit(mode = "all") {
  const errors = [];
  const run = (candidate) => mode === "all" || mode === candidate;

  if (run("dashboard")) {
    const service = requireFile(errors, "lib/account/personal-workspace.ts");
    const page = requireFile(errors, "app/dashboard/page.tsx");
    const frCopy = requireFile(errors, "locales/experience.fr.json");
    const enCopy = requireFile(errors, "locales/experience.en.json");
    expectTokens(errors, "Résumé Dashboard", service, [
      "getPersonalWorkspaceSummary",
      "getVisibleNotificationWhereForSession",
      "getOrganizationEntitlements",
      "Promise.all",
      "actions",
      "recentActivity",
      "take: 20",
    ]);
    expectTokens(errors, "Dashboard i18n", page, [
      "getExperienceCopy",
      "copy.currentContext",
      "copy.expectedActions",
      "copy.subscriptionUsage",
      "copy.organizationsAndRelationships",
      "copy.guide",
      "getIntlLocale",
      "formatEnumLabelForLocale",
    ]);
    expectTokens(errors, "Dashboard FR", frCopy, [
      '"currentContext": "Contexte actuel"',
      '"expectedActions": "Actions attendues"',
      '"subscriptionUsage": "Abonnement et consommation"',
      '"organizationsAndRelationships": "Organisations et relations"',
      '"guide": "Guide du tableau de bord"',
    ]);
    expectTokens(errors, "Dashboard EN", enCopy, [
      '"currentContext": "Current context"',
      '"expectedActions": "Pending actions"',
      '"subscriptionUsage": "Subscription and usage"',
      '"organizationsAndRelationships": "Organizations and relationships"',
      '"guide": "Dashboard guide"',
    ]);
    if (/Math\.random|fake|placeholder KPI/i.test(service)) errors.push("Dashboard: source fictive détectée");
  }

  if (run("context")) {
    const route = requireFile(errors, "app/api/account/context/route.ts");
    const signInRoute = requireFile(errors, "app/api/auth/sign-in/route.ts");
    const authForm = requireFile(errors, "components/auth/auth-form.tsx");
    const switcher = requireFile(errors, "components/layout/organization-context-switcher.tsx");
    const mobileShell = requireFile(errors, "components/dtsc/mobile-shell.tsx");
    const mobileCopyFr = requireFile(errors, "locales/experience.fr.json");
    expectTokens(errors, "Changement d’espace", route, [
      "isSameOriginRequest",
      "rateLimit",
      "getDefaultContextForRole",
      "resolveOrganizationLoginContext",
      "setSessionCookie",
      "ORGANIZATION_CONTEXT_SWITCHED",
      "reasonCode",
    ]);
    expectTokens(errors, "Connexion avec choix d’espace", signInRoute, [
      "hasExplicitWorkspaceSelection",
      "getDefaultContextForRole",
      "requestedOrganizationId",
      "resolveOrganizationLoginContext",
      "Chargez vos espaces puis choisissez",
    ]);
    expectTokens(errors, "Parcours de connexion", authForm, [
      "UNSELECTED_WORKSPACE",
      "organizationsLoaded",
      "signInReady",
      "Charger mes espaces",
      "Choisissez votre espace",
      "Mon espace personnel",
    ]);
    expectTokens(errors, "Sélecteur d’espace localisé", switcher, [
      "useAppLocale",
      "getExperienceCopy",
      "copy.personalWorkspace",
      "copy.switchWorkspace",
      "/api/account/context",
    ]);
    expectTokens(errors, "Contrat espace FR", mobileCopyFr, [
      '"personalWorkspace": "Mon espace personnel"',
      '"switchWorkspace": "Changer d’espace de travail"',
    ]);

    const systemRailPosition = mobileShell.indexOf("data-mobile-system-rail");
    const switcherPosition = mobileShell.indexOf("<OrganizationContextSwitcher");
    const signOutPosition = mobileShell.indexOf('onClick={() => void signOut()}');
    const bottomNavPosition = mobileShell.indexOf("data-mobile-bottom-nav");
    const groupsPosition = mobileShell.indexOf("{groups.map((group) => {");
    if (!(systemRailPosition >= 0 && switcherPosition > systemRailPosition && signOutPosition > switcherPosition)) {
      errors.push("Navigation mobile: le rail système doit conserver sélecteur d’espace → Déconnexion");
    }
    if (!(bottomNavPosition >= 0 && groupsPosition > bottomNavPosition)) {
      errors.push("Navigation mobile: les grands groupes doivent rester dans la barre inférieure primaire");
    }
    if (mobileShell.includes("visibleGroups.map") || mobileShell.includes("QuickChip")) {
      errors.push("Navigation mobile: la barre supérieure ne doit pas dupliquer les grands groupes");
    }
  }

  if (run("subscription")) {
    const page = requireFile(errors, "app/billing/page.tsx");
    const commercialContext = requireFile(errors, "lib/billing/commercial-context.ts");
    const entitlements = requireFile(errors, "lib/billing/entitlements.ts");
    const aiLimits = requireFile(errors, "lib/billing/ai-usage-limits.ts");
    const cag = requireFile(errors, "lib/ai/cag-registry.ts");
    const migration = requireFile(errors, "prisma/migrations/20260811103500_reconcile_organization_billing_plan_audience/migration.sql");

    expectTokens(errors, "Abonnement", page, [
      "resolvePersonalCommercialContext",
      "getOrganizationEntitlements",
      "usageLog.aggregate",
      "knowledgeDocument.count",
      "Offre appliquée",
      "Niveau de capacité",
      "contextualDailyMessageLimit",
      "contextualDailyTokenLimit",
      "Factures SaaS",
      "Guide de l’Abonnement",
    ]);
    expectTokens(errors, "Contexte commercial canonique", commercialContext, [
      "resolveOrganizationCommercialContext",
      "resolvePersonalCommercialContext",
      "ORGANIZATION_SUBSCRIPTION",
      "ORGANIZATION_LEGACY_MAPPED",
      "ORGANIZATION_BASELINE",
      "PERSONAL_SUBSCRIPTION",
      "FREEMIUM_PLAN",
      "org-starter",
      "org-growth",
      "org-premium",
      'organizationType: "CLIENT"',
    ]);
    expectTokens(errors, "Entitlements", entitlements, [
      "resolveOrganizationCommercialContext",
      "offerName",
      "capabilityLabel",
      "subscriptionActive",
      "limits",
      "modules",
      "PLAN_REQUIRED",
      "SUBSCRIPTION_REQUIRED",
    ]);
    expectTokens(errors, "Limites IA", aiLimits, [
      "resolveOrganizationCommercialContext",
      "resolvePersonalCommercialContext",
      "ORGANIZATION_BASELINE",
      "dailyMessageLimit: 0",
      "dailyTokenLimit: 0",
      "DTSC_INTERNAL_USER_LIMITS",
    ]);
    expectTokens(errors, "CAG commercial", cag, ["Offre commerciale:", "Niveau de capacité:", "subscriptionStatus", "getCanonicalAiUsageLimits"]);
    expectTokens(errors, "Migration abonnements historiques", migration, [
      "org-starter",
      "org-growth",
      "org-premium",
      'UPDATE "OrganizationSubscription"',
      '"planId" IN (\'freemium\', \'starter\', \'growth\', \'premium\')',
      "ON CONFLICT DO NOTHING",
    ]);
    if (aiLimits.includes('return fromPlan(organizationSubscription.plan') || aiLimits.includes('if (organizationSubscription)')) {
      errors.push("Limites IA: ancien resolver organisation parallèle détecté");
    }
  }

  if (run("notification-deep-links")) {
    const page = requireFile(errors, "app/notifications/page.tsx");
    const access = requireFile(errors, "lib/notification-access.ts");
    expectTokens(errors, "Notifications paginées", page, ["pageSize = 30", "skip:", "take: pageSize", "contains: query", "Page suivante"]);
    expectTokens(errors, "Notifications globales", access, ["ENTERPRISE_INVITATION_NOTIFICATION_TYPES", "GLOBAL_ACCOUNT_NOTIFICATION_TYPES", "ACTIVE", "INVITED"]);
    requireFile(errors, "docs/STANDARD_NOTIFICATION_DEEP_LINK_MODEL.md");
  }

  if (run("notification-preferences")) {
    const settings = requireFile(errors, "app/settings/page.tsx");
    const appShell = requireFile(errors, "components/layout/app-shell.tsx");
    const frCopy = requireFile(errors, "locales/experience.fr.json");
    expectTokens(errors, "Préférences notification", settings, [
      "SessionAndPushSettings",
      "getExperienceCopy",
      "copy.accountPreferences",
      "copy.guide",
    ]);
    expectTokens(errors, "Préférences notification FR", frCopy, [
      '"accountPreferences": "Préférences du compte"',
      '"guide": "Guide des paramètres"',
    ]);
    expectTokens(errors, "Pont PWA", appShell, ["PwaNotificationBridge", "AppResumeSync", "pushNotificationsEnabled"]);
    requireFile(errors, "docs/STANDARD_NOTIFICATION_PREFERENCE_MODEL.md");
  }

  if (run("invitations")) {
    const route = requireFile(errors, "app/api/enterprise/invitations/[id]/route.ts");
    const page = requireFile(errors, "app/enterprise-invitations/page.tsx");
    expectTokens(errors, "Invitation idempotente", route, ["idempotent: true", "enterprise_invitation_accept_replayed", "enterprise_invitation_decline_replayed", "isSameOriginRequest", "rateLimit"]);
    expectTokens(errors, "Invitations compte", page, ["Historique récent", "Guide des Invitations", "getPendingEnterpriseInvitationsForUser"]);
  }

  if (run("profile-settings")) {
    const profile = requireFile(errors, "app/profile/page.tsx");
    const editor = requireFile(errors, "components/profile/profile-editor.tsx");
    const company = requireFile(errors, "app/company/page.tsx");
    expectTokens(errors, "Profil", profile, ["Visibilité et responsabilités", "Guide du Profil", "publicProfileConsent"]);
    expectTokens(errors, "Avatar", editor, ["optimizeAvatarFile", "/api/account/avatar", "image/webp"]);
    expectTokens(errors, "Entreprise du compte", company, ["Modèle du compte", "Organisations rejointes", "Invitations et relations", "Guide Entreprise"]);
  }

  if (run("sessions")) {
    const settings = requireFile(errors, "app/settings/page.tsx");
    const session = requireFile(errors, "lib/session.ts");
    const frCopy = requireFile(errors, "locales/experience.fr.json");
    expectTokens(errors, "Session actuelle", settings, [
      "copy.currentSession",
      "authTime",
      "absoluteExp",
      "Aucune gestion multi-appareils fictive",
      "getIntlLocale",
    ]);
    expectTokens(errors, "Session actuelle FR", frCopy, ['"currentSession": "Session actuelle"']);
    expectTokens(errors, "Session signée", session, ["createSessionToken", "verifySessionToken", "absoluteExp", "constantTimeEqual"]);
    requireFile(errors, "docs/STANDARD_SESSION_SECURITY_MODEL.md");
  }

  if (run("guides")) {
    const runtimeGuides = requireFile(errors, "lib/account/standard-guides.ts");
    const guidePage = requireFile(errors, "app/help/standard/page.tsx");
    expectTokens(errors, "Guides embarqués", runtimeGuides, ["dashboard", "billing", "company", "profile", "settings", "notifications", "invitations", "company-relationships"]);
    expectTokens(errors, "Page guides", guidePage, ["getStandardPersonalWorkspaceGuide", "Tous les guides", "Procédure utilisateur"]);
    for (const file of [
      "docs/user-guides/DASHBOARD.md",
      "docs/user-guides/BILLING.md",
      "docs/user-guides/COMPANY_ACCOUNT.md",
      "docs/user-guides/PROFILE.md",
      "docs/user-guides/SETTINGS.md",
      "docs/user-guides/NOTIFICATIONS.md",
      "docs/user-guides/INVITATIONS.md",
      "docs/user-guides/COMPANY_RELATIONSHIPS_ACCOUNT.md",
    ]) requireFile(errors, file);
  }

  if (mode === "all") {
    for (const file of [
      "docs/STANDARD_PERSONAL_WORKSPACE_ARCHITECTURE.md",
      "docs/STANDARD_ACCOUNT_COMPANY_MODEL.md",
      "docs/STANDARD_ACCOUNT_CONTEXT_MODEL.md",
      "docs/STANDARD_SUBSCRIPTION_CAPABILITY_MODEL.md",
      "docs/STANDARD_NOTIFICATION_DEEP_LINK_MODEL.md",
      "docs/STANDARD_NOTIFICATION_PREFERENCE_MODEL.md",
      "docs/STANDARD_SESSION_SECURITY_MODEL.md",
      "docs/STANDARD_MODULE_ITERATION_02_AUDIT.md",
      "docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_02.md",
    ]) requireFile(errors, file);
    const e2e = requireFile(errors, "docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_02.md");
    expectTokens(errors, "E2E manuel", e2e, ["Statut : NON_EXÉCUTÉ", "Tests E2E manuels préparés — validation du propriétaire en attente"]);
    const audit = requireFile(errors, "docs/STANDARD_MODULE_ITERATION_02_AUDIT.md");
    if (!audit.includes("Aucune migration Prisma")) errors.push("Audit itération 2: décision de migration absente");
    if (!audit.includes("Aucune promotion vers `COMMERCIAL_READY`")) errors.push("Audit itération 2: gouvernance commerciale absente");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
