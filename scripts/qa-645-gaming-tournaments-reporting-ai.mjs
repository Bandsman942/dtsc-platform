import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const includesAll = (content, markers, label) => {
  for (const marker of markers) check(content.includes(marker), `${label}: missing ${marker}`);
};

const registry = readJson("lib/enterprise/module-registry-gaming.json");
const analytics = read("lib/enterprise/gaming/analytics.ts");
const reports = read("lib/enterprise/gaming/reports.ts");
const reportSchemas = read("lib/enterprise/gaming/report-schemas.ts");
const tournaments = read("lib/enterprise/gaming/tournaments.ts");
const tournamentSchemas = read("lib/enterprise/gaming/tournament-schemas.ts");
const access = read("lib/enterprise/gaming/access.ts");
const dashboardRoute = read("app/api/enterprise/[organizationId]/gaming/dashboard/route.ts");
const reportsRoute = read("app/api/enterprise/[organizationId]/gaming/reports/route.ts");
const tournamentRoute = read("app/api/enterprise/[organizationId]/gaming/tournaments/route.ts");
const registrationRoute = read("app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/registrations/route.ts");
const dashboardPage = read("app/enterprise-modules/GAMING_DASHBOARD/page.tsx");
const tournamentPage = read("app/enterprise-modules/GAMING_TOURNAMENTS/page.tsx");
const reportsPage = read("app/enterprise-modules/GAMING_REPORTS/page.tsx");
const dashboardWorkspace = read("components/enterprise/gaming/enterprise-gaming-dashboard-workspace.tsx");
const tournamentWorkspace = read("components/enterprise/gaming/enterprise-gaming-tournaments-workspace.tsx");
const reportsWorkspace = read("components/enterprise/gaming/enterprise-gaming-reports-workspace.tsx");
const aiContract = read("lib/ai/tools/erp-contract.ts");
const aiPolicy = read("lib/ai/tools/erp-assistant-policy.ts");
const aiGaming = read("lib/ai/tools/executors/gaming.ts");
const aiExecutors = read("lib/ai/tools/executors/index.ts");
const prismaSchema = read("prisma/enterprise-gaming.prisma");
const migration = read("prisma/migrations/20260915110000_gaming_tournaments/migration.sql");
const docs = read("docs/ISSUE_645_GAMING_TOURNAMENTS_REPORTING_AI.md");

check(registry.version >= 7, "gaming registry version must include #645");
for (const [code, routePath, workspaceKey, prefix] of [
  ["GAMING_DASHBOARD", "/enterprise-modules/GAMING_DASHBOARD", "ENTERPRISE_GAMING_DASHBOARD", "enterprise.gaming.overview."],
  ["GAMING_TOURNAMENTS", "/enterprise-modules/GAMING_TOURNAMENTS", "ENTERPRISE_GAMING_TOURNAMENTS", "enterprise.gaming.tournaments."],
  ["GAMING_REPORTS", "/enterprise-modules/GAMING_REPORTS", "ENTERPRISE_GAMING_REPORTS", "enterprise.gaming.reports."],
]) {
  const item = registry.modules.find((candidate) => candidate.code === code);
  check(item?.implementationStatus === "BETA", `${code} must be BETA`);
  check(item?.routeKind === "DEDICATED_CORE", `${code} must be DEDICATED_CORE`);
  check(item?.routePath === routePath, `${code} route path missing`);
  check(item?.workspaceKey === workspaceKey, `${code} workspace key missing`);
  check(item?.accessPolicy === "POSITION_PERMISSION", `${code} must use position permissions`);
  check(item?.permissionPrefixes?.includes(prefix), `${code} permission prefix missing`);
  check(item?.minimumPlan === "BUSINESS", `${code} minimum plan must remain BUSINESS`);
}

includesAll(prismaSchema, [
  "model EnterpriseGamingTournament",
  "model EnterpriseGamingTournamentRegistration",
  "model EnterpriseGamingTournamentStation",
  "model EnterpriseGamingTournamentTransition",
  "businessPartyId",
  "salesInvoiceId",
  "stationId",
  "idempotencyKey",
], "tournament persistence");
includesAll(migration, [
  'CREATE TABLE "EnterpriseGamingTournament"',
  'CREATE TABLE "EnterpriseGamingTournamentRegistration"',
  'CREATE TABLE "EnterpriseGamingTournamentStation"',
  'CREATE TABLE "EnterpriseGamingTournamentTransition"',
], "tournament migration");
check(!/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i.test(migration), "#645 migration must remain additive");

includesAll(tournamentSchemas, ["gamingTournamentCreateSchema", "gamingTournamentRegistrationSchema", "gamingTournamentStationSchema", "gamingTournamentRegistrationCommandSchema"], "tournament schemas");
includesAll(tournaments, [
  "enterpriseBusinessParty.findFirst",
  'roleCode: "CUSTOMER"',
  "enterpriseSalesInvoice.create",
  "createAccountingApprovalAssignment",
  "publishFinanceEvent",
  "enterpriseAsset.findFirst",
  "enterpriseAssetIncident",
  "enterpriseAssetMaintenance",
  "GAMING_TOURNAMENT_STATION_CONFLICT",
  "Prisma.TransactionIsolationLevel.Serializable",
], "tournament canonical domains");
check(!tournaments.includes("EnterpriseGamingCustomer"), "tournaments must not create a parallel Gaming customer master");
check(!tournaments.includes("EnterpriseGamingPayment"), "tournaments must not create a parallel Gaming payment master");
check(!tournaments.includes("enterpriseTreasuryTransaction.create"), "tournaments must not create treasury entries directly");

includesAll(access, ["getEnterpriseGamingDashboardAccess", "getEnterpriseGamingTournamentAccess", "getEnterpriseGamingReportAccess"], "gaming access helpers");
includesAll(tournamentRoute, ["getEnterpriseGamingTournamentAccess", "isSameOriginRequest", "rateLimit", "writeAuditLog", "writeApiLog"], "tournament API");
includesAll(registrationRoute, ["getEnterpriseGamingTournamentAccess", "registerGamingTournamentParticipant", "writeAuditLog", "writeApiLog"], "tournament registration API");

includesAll(analytics, [
  "enterpriseGamingSession.aggregate",
  "enterpriseGamingBooking.groupBy",
  "enterpriseAssetIncident.count",
  "enterpriseAssetMaintenance.count",
  "enterpriseSalesInvoice.findMany",
  "financialByCurrency",
  "averageBasket",
], "gaming analytics");
check(!analytics.includes("exchangeRate"), "dashboard must not silently convert currencies");
check(!analytics.includes("functionalCurrency"), "dashboard must not aggregate currencies through functional currency");
includesAll(dashboardRoute, [
  "getEnterpriseGamingDashboardAccess",
  'moduleCode: "ASSETS_MAINTENANCE"',
  'moduleCode: "FINANCE_RECEIVABLES"',
  "getGamingDashboardSnapshot",
], "dashboard permission boundaries");

includesAll(reportSchemas, [
  "GAMING_STATION_UTILIZATION",
  "GAMING_REVENUE",
  "GAMING_OFF_PEAK",
  "GAMING_INCIDENTS_MAINTENANCE",
  "GAMING_BOOKINGS_NO_SHOW",
], "gaming report families");
includesAll(reports, [
  "enterpriseReport.create",
  'sourceModule: "GAMING_REPORTS"',
  'sourcePolicyCode: "GAMING_CANONICAL_V1"',
  "enterpriseAssetIncident.findMany",
  "enterpriseAssetMaintenance.findMany",
  "enterpriseSalesInvoice.findMany",
  "separatedCurrencies",
], "canonical report generation");
check(!reports.includes("exchangeRate"), "Gaming reports must not silently convert currencies");
includesAll(reportsRoute, [
  'moduleCode: "REPORTS"',
  "enterpriseReportVisibilityWhere",
  'moduleCode: "ASSETS_MAINTENANCE"',
  'moduleCode: "FINANCE_RECEIVABLES"',
  "generateGamingReport",
  "isSameOriginRequest",
  "rateLimit",
], "report route permissions");

for (const [page, workspace, name] of [
  [dashboardPage, dashboardWorkspace, "dashboard"],
  [tournamentPage, tournamentWorkspace, "tournaments"],
  [reportsPage, reportsWorkspace, "reports"],
]) {
  includesAll(page, ["resolveEnterpriseModuleCapabilities", "activeContext", "organizationId", "AppShell"], `${name} page guard`);
  includesAll(workspace, ["useAppLocale", "ModuleWorkspace", "ModuleHeader", "ModuleContent"], `${name} workspace UX`);
}
includesAll(dashboardWorkspace, ["financialByCurrency", "Les devises restent séparées", "ASSETS_MAINTENANCE"], "dashboard financial/asset UX");
includesAll(tournamentWorkspace, ["businessPartyId", "invoiceApproverUserId", "ASSETS_MAINTENANCE", "CHECK_IN", "SET_RESULT", "RELEASE"], "tournament UI workflow");
includesAll(reportsWorkspace, ["GAMING_REVENUE", "GAMING_INCIDENTS_MAINTENANCE", "/reports/${item.id}/export"], "report UI/export");

includesAll(aiContract, ["ERP_GAMING_PERFORMANCE_READ", 'moduleCode: "GAMING_DASHBOARD"'], "Gaming AI contract");
includesAll(aiPolicy, ["GAMING_ERP_ASSISTANT_CODES", '"ENTERPRISE_GENERAL"', '"GAMING_DASHBOARD"'], "Gaming AI assistant policy");
includesAll(aiGaming, [
  "getEnterpriseGamingDashboardAccess",
  'moduleCode: "ASSETS_MAINTENANCE"',
  'moduleCode: "FINANCE_RECEIVABLES"',
  "FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE",
  "financialByCurrency",
  "Les montants de devises différentes ne sont jamais additionnés",
], "Gaming AI permission and factuality boundaries");
check(!aiGaming.includes("create("), "Gaming AI tool must remain read-only");
check(aiExecutors.indexOf("...GAMING_AI_TOOL_EXECUTORS") > aiExecutors.indexOf("...ERP_AI_TOOL_EXECUTORS"), "Gaming AI executor must override the generic ERP adapter for its specialized read tool");

includesAll(docs, ["#645", "OWNER_E2E", "GAMING_TOURNAMENTS", "GAMING_REPORTS", "ERP_GAMING_PERFORMANCE_READ", "CDF", "USD"], "#645 documentation");

if (errors.length) {
  console.error(`FAIL QA #645 (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("PASS QA #645 Gaming tournaments, reporting and DTSC AI");
