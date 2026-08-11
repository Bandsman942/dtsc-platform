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
    expectTokens(errors, "Résumé Dashboard", service, [
      "getPersonalWorkspaceSummary",
      "getVisibleNotificationWhereForSession",
      "getOrganizationEntitlements",
      "Promise.all",
      "actions",
      "recentActivity",
      "take: 20",
    ]);
    expectTokens(errors, "Dashboard", page, [
      "Contexte actuel",
      "Actions attendues",
      "Abonnement et consommation",
      "Organisations et relations",
      "Guide du Dashboard",
    ]);
    if (/Math\.random|fake|placeholder KPI/i.test(service)) errors.push("Dashboard: source fictive détectée");
  }

  if (run("context")) {
    const route = requireFile(errors, "app/api/account/context/route.ts");
    expectTokens(errors, "Changement de contexte", route, [
      "isSameOriginRequest",
      "rateLimit",
      "resolveOrganizationLoginContext",
      "setSessionCookie",
      "ORGANIZATION_CONTEXT_SWITCHED",
      "reasonCode",
    ]);
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
    expectTokens(errors, "Préférences notification", settings, ["SessionAndPushSettings", "Préférences du compte", "Guide des Paramètres"]);
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
    expectTokens(errors, "Session actuelle", settings, ["Session actuelle", "authTime", "absoluteExp", "Aucune gestion multi-appareils fictive"]);
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
