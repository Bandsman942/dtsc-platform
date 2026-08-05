import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(file) { const target = path.join(root, file); if (!fs.existsSync(target)) throw new Error(`Fichier absent: ${file}`); return fs.readFileSync(target, "utf8"); }
function has(file, needle) { if (!read(file).includes(needle)) throw new Error(`${file}: contrat absent: ${needle}`); }
function json(file) { return JSON.parse(read(file)); }
function noMatch(file, pattern, label) { if (pattern.test(read(file))) throw new Error(`${file}: ${label}`); }
function codes() { return new Map(json("lib/modules/standard-module-registry-data.json").modules.map((item) => [item.code, item])); }

const iteration07Codes = [
  "CONSOLE_OVERVIEW", "CONSOLE_USERS", "CONSOLE_CLIENT_ENTERPRISES", "CONSOLE_SUBSCRIPTIONS", "CONSOLE_SUPPORT",
  "CONSOLE_CONTENT", "CONSOLE_VISITS", "CONSOLE_PLATFORM_SETTINGS", "CONSOLE_SECURITY_AUDIT", "CONSOLE_RBAC",
  "DTSC_INTERNAL_ADMIN", "DTSC_HR_CFO", "DTSC_SCO", "DTSC_COO", "DTSC_CEO", "DTSC_MPO", "DTSC_CTO", "DTSC_LEGAL",
];

const profiles = {
  routes() {
    has("lib/console/console-routes.ts", "clientorganizations: \"organizations\"");
    has("lib/console/console-routes.ts", "billing: \"subscriptions\"");
    has("lib/console/console-routes.ts", "activity: \"support\"");
    has("lib/console/console-routes.ts", "la: \"legal\"");
    has("app/admin/[section]/page.tsx", "DtscConsolePage");
    has("app/admin/erp-readiness/page.tsx", "redirect(\"/admin/module-maturity\")");
    const registry = codes();
    for (const code of iteration07Codes) {
      const module = registry.get(code); if (!module?.routePath?.startsWith("/admin")) throw new Error(`${code}: route Console non canonique`);
    }
  },
  renderSideEffects() {
    const files = ["app/admin/page.tsx", "app/admin/console-page.tsx", ...fs.readdirSync(path.join(root, "lib/console")).filter((name) => name.endsWith(".ts") && name !== "console-webhooks.ts").map((name) => `lib/console/${name}`)];
    const forbidden = /(syncPaidSubscriptionIncomeTransactions|reconcileFinancialState|ensureDefaultPositions|prisma\.[A-Za-z0-9_]+\.(create|update|delete|upsert)\s*\()/;
    for (const file of files) noMatch(file, forbidden, "mutation métier interdite pendant une lecture Console");
    has("lib/settings.ts", "bootstrapAppSettings");
    has("lib/settings.ts", "getAppSettings(): Promise<AppSetting>");
    has("lib/settings.ts", "prisma.appSetting.findUnique");
  },
  overview() {
    has("lib/console/console-overview.ts", "freshness");
    has("lib/console/console-overview.ts", "definition");
    has("lib/console/console-overview.ts", "period");
    has("components/admin/console-saas-overview.tsx", "actionQueue");
    noMatch("lib/console/console-overview.ts", /mock|fake|placeholder/i, "KPI fictif interdit");
  },
  users() {
    has("lib/console/console-users.ts", "parseConsolePagination");
    has("lib/console/console-user-protection.ts", "LAST_ADMIN_PROTECTED");
    for (const file of ["role", "status", "limits"]) has(`app/api/admin/users/[id]/${file}/route.ts`, "requireConsoleCapability");
    has("app/api/admin/exports/users/route.ts", "CONSOLE_USERS_EXPORTED");
  },
  organizations() {
    has("lib/console/console-organizations.ts", "parseConsolePagination");
    has("app/api/admin/client-organizations/route.ts", "status: \"INVITED\"");
    has("app/api/enterprise/invitations/[id]/route.ts", "Invitation administrateur acceptée");
    has("app/api/admin/client-organizations/[id]/route.ts", "LAST_ADMIN_PROTECTED");
    has("app/api/admin/exports/organizations/route.ts", "CONSOLE_ORGANIZATIONS_EXPORTED");
  },
  subscriptions() {
    has("prisma/schema.prisma", "model BillingPlanVersion");
    has("app/api/admin/billing-plans/[id]/route.ts", "billingPlanVersion");
    has("app/api/admin/billing/reconcile/route.ts", "CONSOLE_CAPABILITIES.RECONCILE_BILLING");
    has("app/api/admin/billing/reconcile/route.ts", "consoleOperationJob");
    has("app/api/admin/exports/payments/route.ts", "CONSOLE_PAYMENTS_EXPORTED");
  },
  support() {
    has("lib/console/console-support.ts", "parseConsolePagination");
    has("lib/support-sla.ts", "firstResponseDueAt");
    has("app/api/support/tickets/[id]/route.ts", "assignedToDtscUserId");
    has("app/api/support/tickets/[id]/route.ts", "escalationReason");
    has("components/support/ticket-board.tsx", "pauseSla");
  },
  content() {
    has("prisma/schema.prisma", "model PublicPublicationVersion");
    has("app/api/admin/publications/[id]/route.ts", "publicPublicationVersion");
    has("app/api/admin/publications/[id]/route.ts", "ARCHIVED");
    has("app/admin/content/preview/[id]/page.tsx", "Prévisualisation protégée");
    has("components/admin/public-publications-manager.tsx", "/admin/content/preview/");
  },
  visits() {
    has("lib/console/console-overview.ts", "siteVisit");
    has("components/admin/site-visits-chart.tsx", "points");
    noMatch("lib/console/console-overview.ts", /country|region|device/i, "dimension d'acquisition non collectée présentée comme réelle");
  },
  settings() {
    has("prisma/schema.prisma", "model FeatureFlag");
    has("prisma/schema.prisma", "model PlatformSettingHistory");
    has("app/api/admin/settings/route.ts", "platformSettingHistory");
    has("app/api/admin/feature-flags/[id]/route.ts", "requireConsoleCapability");
    noMatch("components/admin/admin-settings-panel.tsx", /password|secretValue|apiKey/i, "valeur secrète exposée");
  },
  security() {
    has("lib/console/console-redaction.ts", "redactConsoleValue");
    has("lib/console/console-audit.ts", "parseConsolePagination");
    has("app/api/admin/webhooks/[id]/retry/route.ts", "WEBHOOK_ALREADY_APPLIED");
    has("prisma/schema.prisma", "idempotencyKey");
    has("app/api/admin/exports/audit/route.ts", "CONSOLE_AUDIT_EXPORTED");
  },
  rbac() {
    has("lib/console/console-capability-catalog.ts", "CONSOLE_USERS_MANAGE");
    has("lib/console/console-capabilities.ts", "ALLOWED_INDIVIDUAL_GRANT");
    has("lib/admin-api.ts", "requireConsoleCapability");
    has("lib/dtsc-individual-permissions.ts", "Object.values(CONSOLE_CAPABILITIES)");
  },
  pagination() {
    for (const file of ["console-users.ts", "console-organizations.ts", "console-support.ts", "console-billing.ts", "console-audit.ts", "console-publications.ts"]) has(`lib/console/${file}`, "parseConsolePagination");
    for (const file of ["lib/console/console-users.ts", "lib/console/console-organizations.ts", "lib/console/console-support.ts", "lib/console/console-audit.ts"]) noMatch(file, /take:\s*(200|300)\b/, "limite fixe non paginée interdite");
  },
  i18n() {
    for (const file of ["locales/fr.json", "locales/en.json"]) {
      const dictionary = json(file); if (!dictionary.console) throw new Error(`${file}: namespace console absent`); if (!dictionary.userGuides) throw new Error(`${file}: namespace userGuides absent`);
    }
    has("app/admin/console-page.tsx", "translate(user.locale");
    has("docs/STANDARD_DTSC_CONSOLE_I18N_CONTRACT.md", "reasonCode");
  },
  guides() {
    const content = read("lib/user-guides/iteration07-guides.ts");
    for (const code of iteration07Codes) if (!content.includes(`\"${code}\"`) && code !== "CONSOLE_MODULE_MATURITY") throw new Error(`Guide itération 7 absent: ${code}`);
    has("app/admin/console-page.tsx", "ContextualUserGuide");
    has("app/admin/module-maturity/page.tsx", "COMMERCIAL_MATURITY_KANBAN");
  },
  internalDashboards() {
    for (const section of ["hr-cfo", "sco", "coo", "ceo", "mpo", "cto", "legal"]) has("lib/console/console-routes.ts", `\"${section}\"`);
    has("lib/console/console-internal-modules.ts", "getConsoleInternalModulesDataset");
    noMatch("lib/console/console-internal-modules.ts", /vercel\.com|api\.github\.com/i, "données techniques externes inventées");
  },
  maturity() {
    const registry = codes();
    for (const code of iteration07Codes) {
      const module = registry.get(code); if (!module) throw new Error(`Module absent du Kanban: ${code}`);
      if (!module.userGuidePath) throw new Error(`${code}: guide absent`);
      if (module.qaContract !== "scripts/qa-standard-dtsc-console-checks.mjs") throw new Error(`${code}: contrat QA itération 7 absent`);
      if (module.maturity === "COMMERCIAL_READY") throw new Error(`${code}: promotion commerciale automatique interdite`);
    }
    has("lib/commercial-maturity-governance.ts", "STANDARD-07");
    has("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_07.md", "NON_EXÉCUTÉ");
  },
};

export function runAudit(profile, label) {
  try { const fn = profiles[profile]; if (!fn) throw new Error(`Profil QA inconnu: ${profile}`); fn(); console.log(`✓ ${label}`); }
  catch (error) { console.error(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
export const iteration07Profiles = Object.keys(profiles);
