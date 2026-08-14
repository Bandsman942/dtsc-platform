import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, markers) => markers.every((marker) => source.includes(marker));

const schema = read("prisma/enterprise-retail-mobile-money-multicurrency.prisma");
check(hasAll(schema, ["model EnterpriseRetailProviderAccount", "@@unique([organizationId, providerId, accountUse, currencyCode])"]), "Telco must reuse the canonical provider/currency account mapping model");

const providerSchema = read("prisma/enterprise-retail.prisma");
check(providerSchema.includes("telcoFloatAccountId       String?"), "Legacy telcoFloatAccountId must remain during the compatibility window");
check(providerSchema.includes("operatorFloatAccountId   String"), "Top-ups must retain the historical operator account used for safe reversal");

const migration = read("prisma/migrations/20260814125000_telco_multicurrency_accounts/migration.sql");
check(hasAll(migration, ['p."telcoFloatAccountId"', "'TELCO_FLOAT'", 'a."currencyCode"', "ON CONFLICT", "'MOBILE_MONEY', 'CLEARING'"]), "Telco migration must additively backfill legacy mappings by real account currency");
check(!migration.includes("DROP COLUMN") && !migration.includes("DROP TABLE"), "Telco migration must remain additive");

const policy = read("lib/enterprise/retail/operator-currency-policy.ts");
check(hasAll(policy, ["requiredRetailOperatorCurrencies", 'return DRC_COUNTRY_MARKERS.has(normalizeCountry(country)) ? ["CDF", "USD"] : []', "mapped.size >= 2"]), "Shared operator currency policy must require CDF/USD in DRC and two configured currencies elsewhere");

const mobileService = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
check(mobileService.includes("requiredRetailOperatorCurrencies"), "Mobile Money and Telco must share one DRC currency policy");

const telcoService = read("lib/enterprise/retail/telco-multicurrency-service.ts");
check(hasAll(telcoService, [
  'TELCO_FLOAT_ACCOUNT_USE = "TELCO_FLOAT"',
  'providerType: { in: ["TELCO", "BOTH"] }',
  'accountType: { in: ["MOBILE_MONEY", "CLEARING"] }',
  "organizationId_providerId_accountUse_currencyCode",
  "resolveTelcoFloatAccountTx",
  "provider.telcoFloatAccountId",
  "RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED",
  "getTelcoProviderAccountConfiguration",
  "isRetailOperatorCurrencyReady",
  "upsertTelcoProviderAccount",
]), "Canonical Telco service must resolve operator accounts by provider + currency with legacy fallback and shared readiness");

const service = read("lib/enterprise/retail/service.ts");
const start = service.indexOf("export async function createTelcoTopup");
const end = service.indexOf("export async function reverseTelcoTopup", start);
const createBlock = start >= 0 && end > start ? service.slice(start, end) : "";
const reverseStart = end;
const reverseEnd = service.indexOf("export async function createRetailDailyClose", reverseStart);
const reverseBlock = reverseStart >= 0 && reverseEnd > reverseStart ? service.slice(reverseStart, reverseEnd) : "";
check(hasAll(createBlock, ["resolveTelcoFloatAccountTx(tx, organizationId, provider, tenderAccount.currencyCode)", "tenderFinancialAccountId", "operatorFloatAccountId: operatorFloatAccount.id", "RETAIL_CURRENCY_MISMATCH"]), "New top-ups must resolve the operator account from the actual tender currency and protect Catalog currency");
check(!createBlock.includes("input.operatorFloatAccountId || provider.telcoFloatAccountId"), "Browser and legacy single-account fields must not select the new Telco operator account");
check(hasAll(reverseBlock, ["topup.tenderFinancialAccountId", "topup.operatorFloatAccountId", "topup.currencyCode"]), "Telco reversal must keep using the historical accounts stored on the original top-up");

const orchestration = read("lib/enterprise/retail/operator-orchestration.ts");
check(hasAll(orchestration, ["createConnectedTelcoTopupOperation", "PENDING_TELCO_TOPUP", "createTelcoTopup(organizationId, operation.createdByUserId, parsed.data)"]), "Connected Telco confirmation must converge on the same server-authoritative top-up service");

const accountRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/accounts/route.ts");
check(hasAll(accountRoute, ['"TELCO_TOPUPS", "read"', '"TELCO_TOPUPS", "manage"', "telcoProviderAccountUpsertSchema", "upsertTelcoProviderAccount"]), "Telco account mapping API must enforce read/manage RBAC and validation");

const closeRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/cash-sessions/[sessionId]/close/route.ts");
check(hasAll(closeRoute, ['"TELCO_TOPUPS", "submit"', "cashCloseSchema", "submitCashSessionClose", 'moduleCode: "TELCO_TOPUPS"']), "Telco cash close must reuse the canonical Finance close under Telco RBAC");

const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
check(hasAll(dashboard, ["getTelcoProviderAccountConfiguration", "telcoConfiguration", "allTelcoProvidersReady", "readyForTelco: canonicalReadiness.ready && allTelcoProvidersReady", "cashSessions"]), "Telco dashboard must expose multi-currency configuration, concurrent tills and readiness");

const cashManager = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
check(hasAll(cashManager, [
  'moduleCode?: "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS"',
  'moduleCode === "TELCO_TOPUPS"',
  "My Telco tills",
  "Mes caisses Télécom",
  'aria-pressed={selected}',
  "CDF + USD",
  "DENOMINATIONS",
  "/retail/telco-topups/cash-sessions/",
  "PENDING_VALIDATION",
  "focus-visible:ring-2",
]), "Telco must reuse the professional concurrent CDF/USD till selector, keyboard focus treatment and counted close workflow");

const sharedWorkspace = read("components/enterprise/professional/retail-workspace-shared.tsx");
check(sharedWorkspace.includes('moduleCode === "RETAIL_POS" ? <CashSessionBar'), "Operator modules must not show the conflicting legacy single-till banner");

const workspace = read("components/enterprise/professional/retail-operator-workspace.tsx");
check(hasAll(workspace, [
  "TelcoDashboard",
  "telcoConfiguration",
  "RetailMultiCashSessionManager",
  'moduleCode="TELCO_TOPUPS"',
  "selectedCashSessionId",
  "eligibleProviders",
  "nonCashAccountId",
  "operatorFloatAccountId: null",
  "selectedOperatorAccount",
  "Comptes opérateur Télécom par devise",
  "Telecom operator accounts by currency",
  "/retail/telco-topups/accounts",
  "md:grid-cols-2",
  "disabled={Boolean(busyAction)}",
]), "Telco UX must expose concurrent tills, payment-derived currency, per-currency operator mappings, responsive layout, disabled busy states and a confirmation of the resolved accounts");
check(workspace.includes("const sessions = useMemo(() => telcoDashboard.cashSessions || [], [telcoDashboard.cashSessions]);"), "Telco cash sessions must use a stable memoized fallback before feeding dependent hooks");
check(!workspace.includes("const sessions = telcoDashboard.cashSessions || [];"), "Telco must not recreate an empty cash-session array on every render");
check(!workspace.includes("input.operatorFloatAccountId"), "Telco UI must not become an authority for operator account selection");

const http = read("lib/enterprise/retail/http.ts");
check(http.includes("RETAIL_TELCO_CURRENCY_ACCOUNT_REQUIRED"), "Missing Telco currency-specific actionable error");

const docs = read("docs/ERP_RETAIL_TELCO_MOBILE_MONEY.md");
check(hasAll(docs, ["TELCO_FLOAT", "CDF + USD", "compte d’encaissement", "operatorFloatAccountId", "Mobile Money ou Télécom"]), "Retail documentation must describe Telco multi-currency mappings, tender-derived currency and historical reversal");

const guides = read("lib/user-guides/retail-telco-mobile-money-guides.ts");
check(hasAll(guides, ["Comptes opérateur CDF/USD par réseau", "CDF/USD operator accounts per network", "Plusieurs caisses CDF/USD simultanées", "Concurrent CDF/USD cash tills"]), "Telco FR/EN guide must explain multi-currency operator accounts and tills");

check(!fs.existsSync(path.join(root, ".github/workflows/tmp-310-telco-multicurrency.yml")), "Temporary #310 workflow must not remain in the branch");
check(!fs.existsSync(path.join(root, "scripts/tmp-310-telco-multicurrency-codemod.mjs")), "Temporary #310 codemod must not remain in the branch");

if (failures.length) {
  console.error("Issue #310 Telco multi-currency QA failed:\n" + failures.map((failure) => "- " + failure).join("\n"));
  process.exit(1);
}
console.log("Issue #310 Telco multi-currency QA passed: operator/currency mappings, CDF/USD readiness, server-side account resolution, concurrent tills, non-cash tender currencies, safe reversal, RBAC and FR/EN UX are guarded.");
