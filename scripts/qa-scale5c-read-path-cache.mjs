import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const summary = read("lib/enterprise/finance/summary-service.ts");
const route = read("app/api/enterprise/[organizationId]/finance-summary/route.ts");
const worker = read("lib/enterprise/workflows/worker.ts");
const cache = read("lib/scalability/tenant-read-cache.ts");
const observability = read("lib/scalability/scale5c-read-path-observability.ts");
const ctoPage = read("app/admin/cto/scalability/page.tsx");
const ctoPanel = read("components/admin/cto-scale5c-read-cache-panel.tsx");
const regression = read("scripts/qa-regression-checks.mjs");
const docs = read("docs/SCALABILITY_SCALE5C_READ_PATH_AUDIT.md");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}
function requireTokens(label, source, tokens) {
  for (const token of tokens) check(source.includes(token), `${label}: token manquant ${token}`);
}
function section(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

requireTokens("finance summary", summary, [
  "withTenantReadCache",
  "invalidateTenantReadCache",
  'projection: "finance-budget-summary"',
  'schemaVersion: "v1"',
  "ttlSeconds: 30",
  "getEnterpriseFinanceSummaryRead",
  "if (!canSeeAll)",
  'source: "BYPASS"',
  "loadEnterpriseFinanceSummaryForOrganization",
  "invalidateEnterpriseFinanceSummaryCacheForDomainEvent",
]);

const organizationLoader = section(
  summary,
  "async function loadEnterpriseFinanceSummaryForOrganization",
  "export async function getEnterpriseFinanceSummaryRead",
);
check(Boolean(organizationLoader), "SCALE-5C: le loader organisationnel Finance doit exister.");
check(!organizationLoader.includes("userId"), "SCALE-5C: le loader cache partagé ne doit jamais dépendre de userId.");
check(!organizationLoader.includes("enterpriseBudgetVisibilityWhere") && !organizationLoader.includes("enterpriseExpenseVisibilityWhere"), "SCALE-5C: le loader partagé ne doit pas réutiliser une visibilité user-specific.");

const restrictedBranch = section(summary, "if (!canSeeAll)", "const cached = await withTenantReadCache");
check(restrictedBranch.includes("userId"), "SCALE-5C: la branche restreinte doit conserver le filtre utilisateur canonique.");
check(restrictedBranch.includes('source: "BYPASS"'), "SCALE-5C: la branche restreinte doit bypasser le cache partagé.");
check(!restrictedBranch.includes("withTenantReadCache"), "SCALE-5C: une vue restreinte ne doit pas atteindre le cache partagé.");

requireTokens("route", route, [
  "getEnterpriseFinanceAccess",
  'moduleCode: "FINANCE_BUDGETS"',
  'action: "read"',
  "getEnterpriseFinanceSummaryRead",
  'domain: "finance-summary"',
  "readSource: summaryRead.source",
  'visibility: access.canSeeAll ? "ORGANIZATION" : "USER_BYPASS"',
  "NextResponse.json(summaryRead.summary)",
]);
check(
  route.indexOf("getEnterpriseFinanceAccess") < route.indexOf("getEnterpriseFinanceSummaryRead("),
  "SCALE-5C: l'autorisation Finance doit précéder toute lecture cache/DB du résumé.",
);
check(!route.includes("NextResponse.json(summaryRead)"), "SCALE-5C: la source technique du cache ne doit pas être retournée dans le payload métier.");

requireTokens("worker", worker, [
  "invalidateEnterpriseFinanceSummaryCacheForDomainEvent",
  "organizationId: event.organizationId",
  "entityType: event.entityType",
]);
check(
  worker.indexOf("processWorkflowDomainEvent(event.id)") < worker.indexOf("invalidateEnterpriseFinanceSummaryCacheForDomainEvent({"),
  "SCALE-5C: l'invalidation Finance Summary doit intervenir après le traitement métier de l'événement.",
);

requireTokens("cache foundation", cache, [
  "organizationId: string",
  "dtsc:read-cache:",
  ":org:",
  "TENANT_READ_CACHE_TIMEOUT_MS = 250",
]);
check(!cache.includes("NEXT_PUBLIC_"), "SCALE-5C: aucun secret Redis ne doit devenir public.");

requireTokens("SCALE-5C observability", observability, [
  '"metadata"->>\'domain\' = \'finance-summary\'',
  '"metadata"->>\'readSource\' = \'HIT\'',
  '"metadata"->>\'readSource\' = \'MISS\'',
  '"metadata"->>\'readSource\' = \'FALLBACK\'',
  '"metadata"->>\'readSource\' = \'BYPASS\'',
  "percentile_cont(0.95)",
  "hitRate",
  "optimizedReadPaths: 4",
  "intentionalBypassReadPaths: 3",
]);
check(!observability.includes("organizationId") && !observability.includes("userId"), "SCALE-5C: l'agrégat CTO ne doit exposer aucun identifiant tenant/utilisateur.");

requireTokens("CTO page", ctoPage, [
  "CONSOLE_CAPABILITIES.SECURITY_READ",
  "getScale5cReadPathObservability(windowHours)",
  "<CtoScale5cReadCachePanel",
]);
check(
  ctoPage.indexOf("CONSOLE_CAPABILITIES.SECURITY_READ") < ctoPage.indexOf("getScale5cReadPathObservability(windowHours)"),
  "SCALE-5C: la décision SECURITY_READ doit rester avant l'agrégation CTO.",
);

requireTokens("CTO SCALE-5C panel", ctoPanel, [
  "fr:",
  "en:",
  "snapshot.financeSummary.hit",
  "snapshot.financeSummary.miss",
  "snapshot.financeSummary.fallback",
  "snapshot.financeSummary.bypass",
  "snapshot.financeSummary.hitRate",
  "snapshot.financeSummary.latencyMs.hitP95",
  "snapshot.financeSummary.latencyMs.databaseP95",
  "data-dtsc-responsive-root",
  "grid-cols-[minmax(0,1fr)]",
]);
check(!ctoPanel.includes("organizationId") && !ctoPanel.includes("userId") && !ctoPanel.includes("DATABASE_URL"), "SCALE-5C: le panneau CTO doit rester secret-free et sans identifiants.");

requireTokens("documentation", docs, [
  "SCALE-5C",
  "2 + 5N",
  "canSeeAll=true",
  "BYPASS",
  "30 secondes",
  "Administration Entreprise",
  "OWNER_E2E",
  "Rollback",
  "#359 / SCALE-6",
]);
check(
  regression.includes('await import("./qa-scale5c-read-path-cache.mjs")'),
  "SCALE-5C: la QA ciblée doit être branchée à qa:regression.",
);

if (failures.length) {
  console.error("FAIL qa-scale5c-read-path-cache");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-scale5c-read-path-cache");
