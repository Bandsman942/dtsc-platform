import fs from "node:fs";

const files = {
  readiness: "lib/enterprise/accounting/finance-readiness-service.ts",
  configuration: "lib/enterprise/accounting/configuration-service.ts",
  periods: "lib/enterprise/accounting/periods.ts",
  close: "lib/enterprise/accounting/close-service.ts",
  workspace: "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx",
  financeFr: "locales/enterprise-finance.fr.json",
  financeEn: "locales/enterprise-finance.en.json",
  openYearRoute: "app/api/enterprise/[organizationId]/fiscal-years/[fiscalYearId]/open/route.ts",
  retailAccountingReadiness: "lib/enterprise/retail/accounting-readiness.ts",
  retailExecution: "lib/enterprise/retail/sale-execution.ts",
  retailPreflight: "lib/enterprise/retail/accounting-preflight.ts",
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) {
    console.error(`FAIL fichier requis introuvable: ${path}`);
    process.exit(1);
  }
}

const readiness = fs.readFileSync(files.readiness, "utf8");
const configuration = fs.readFileSync(files.configuration, "utf8");
const periods = fs.readFileSync(files.periods, "utf8");
const close = fs.readFileSync(files.close, "utf8");
const workspace = fs.readFileSync(files.workspace, "utf8");
const financeFr = JSON.parse(fs.readFileSync(files.financeFr, "utf8"));
const financeEn = JSON.parse(fs.readFileSync(files.financeEn, "utf8"));
const openYearRoute = fs.readFileSync(files.openYearRoute, "utf8");
const retailAccountingReadiness = fs.readFileSync(files.retailAccountingReadiness, "utf8");
const retailExecution = fs.readFileSync(files.retailExecution, "utf8");
const retailPreflight = fs.readFileSync(files.retailPreflight, "utf8");

function requireTokens(source, tokens, label) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      console.error(`FAIL ${label}: contrat absent: ${token}`);
      process.exit(1);
    }
  }
}

function requireLocalizedKey(key, fr, en, renderToken, label) {
  requireTokens(workspace, [renderToken], label);
  if (financeFr[key] !== fr) {
    console.error(`FAIL ${label}: catalogue FR inattendu pour ${key}: ${financeFr[key] ?? "ABSENT"}`);
    process.exit(1);
  }
  if (financeEn[key] !== en) {
    console.error(`FAIL ${label}: catalogue EN inattendu pour ${key}: ${financeEn[key] ?? "ABSENT"}`);
    process.exit(1);
  }
}

requireTokens(readiness, [
  'code: "OPEN_FISCAL_YEAR_REQUIRED"',
  'fiscalYear: { status: "OPEN" }',
  'RETAIL_FINANCIAL_ACCOUNT_REQUIRED',
  'severity: retailFinanceRequired ? "BLOCKER" : "WARNING"',
  'actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=years"',
  'actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=periods"',
  'actionHref: "/enterprise-modules/FINANCE_ACCOUNTING?tab=accounts"',
  'actionHref: "/enterprise-modules/FINANCE_TREASURY?tab=accounts"',
], "readiness");

for (const legacy of ["?tab=fiscal-years", "?tab=fiscal-periods", "?tab=ledger-accounts"]) {
  if (readiness.includes(legacy)) {
    console.error(`FAIL readiness: ancien deep-link mort encore présent: ${legacy}`);
    process.exit(1);
  }
}

requireTokens(configuration, [
  '"FUNCTIONAL_CURRENCY_REQUIRED"',
  '"CHART_REQUIRED"',
  '"ACTIVE_CHART_REQUIRED"',
  '"CHART_ACCOUNTS_REQUIRED"',
  '"TEMPLATE_LINEAGE_REQUIRED"',
  '"TEMPLATE_SEMANTIC_COVERAGE_REQUIRED"',
  '"ORGANIZATION_MAPPINGS_REQUIRED"',
  '"JOURNALS_REQUIRED"',
  'POSTING_GLOBAL_BLOCKERS.has(diagnostic.code)',
  'getPostingPeriod()',
], "posting readiness gate");

const globalBlockerDeclaration = configuration.match(/const POSTING_GLOBAL_BLOCKERS = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
for (const temporalCode of ["OPEN_FISCAL_YEAR_REQUIRED", "OPEN_FISCAL_PERIOD_REQUIRED"]) {
  if (globalBlockerDeclaration.includes(temporalCode)) {
    console.error(`FAIL posting readiness gate: ${temporalCode} doit rester daté via getPostingPeriod, pas global.`);
    process.exit(1);
  }
}

requireTokens(periods, [
  'fiscalYear: { status: "OPEN" }',
  'FINANCE_PERIOD_NOT_FOUND',
  'FINANCE_PERIOD_CLOSED',
  'FINANCE_PERIOD_BLOCKS_DRAFT_MUTATION',
], "posting period");

requireTokens(openYearRoute, [
  'authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage"',
  'openFiscalYear(organizationId, fiscalYearId, auth.session.userId, parsed.data.revision)',
  'action: "ENTERPRISE_FISCAL_YEAR_OPENED"',
], "fiscal year open endpoint");

requireTokens(close, [
  'current?.status === "DRAFT" || current?.status === "BLOCKED"',
  'requestedByUserId: actorUserId',
  'status: fresh.ready ? "PENDING_APPROVAL" : "BLOCKED"',
  'const fresh = await calculateFinancialCloseChecklist(organizationId, snapshot.fiscalPeriodId)',
  'eventType: "FINANCIAL_CLOSE_NEW_BLOCKERS"',
  'fromStatus: "APPROVED", toStatus: "BLOCKED"',
  'approvedByUserId: null',
  'assertIndependentActor({ actorUserId, relatedUserIds: [close.requestedByUserId]',
], "financial close retry and final revalidation");

requireTokens(workspace, [
  'usePathname, useRouter, useSearchParams',
  'const requestedTab = searchParams.get("tab")',
  'router.replace(`${pathname}?${params.toString()}`, { scroll: false })',
  'item.status === "BLOCKED"',
  'unbalancedPostedEntries: "unbalancedPostedEntries"',
  'openCashSessions: "openCashSessions"',
  'unresolvedClearingAccounts: "unresolvedClearingAccounts"',
], "finance workspace");

requireLocalizedKey("openFiscalYear", "Ouvrir l’exercice", "Open fiscal year", 't("openFiscalYear")', "finance workspace / ouverture exercice");
requireLocalizedKey("recheckClose", "Recalculer la clôture", "Recheck close", 't("recheckClose")', "finance workspace / recalcul clôture");
requireLocalizedKey("anotherAuthorizedUserClose", "Un autre utilisateur autorisé doit approuver et fermer la période.", "Another authorized user must approve and close the period.", 't("anotherAuthorizedUserClose")', "finance workspace / séparation des rôles");
requireLocalizedKey("unbalancedPostedEntries", "Écritures comptabilisées déséquilibrées", "Unbalanced posted entries", '"unbalancedPostedEntries"', "finance workspace / anomalie écritures");
requireLocalizedKey("openCashSessions", "Sessions de caisse ouvertes", "Open cash sessions", '"openCashSessions"', "finance workspace / sessions caisse");
requireLocalizedKey("unresolvedClearingAccounts", "Comptes d’attente non soldés", "Unresolved clearing accounts", '"unresolvedClearingAccounts"', "finance workspace / comptes d’attente");

if (JSON.stringify(Object.keys(financeFr).sort()) !== JSON.stringify(Object.keys(financeEn).sort())) {
  console.error("FAIL finance workspace: parité de clés enterprise-finance FR/EN rompue.");
  process.exit(1);
}

requireTokens(retailAccountingReadiness, [
  'getEnterpriseFinanceReadiness(organizationId, { mode: "POSTING", asOf: at })',
  'fiscalYear: { status: "OPEN" }',
  'status: "OPEN"',
  'financeReady: financeReadiness.ready',
  'financeBlockers: financeReadiness.blockers.map((diagnostic) => diagnostic.code)',
], "Shop canonical accounting readiness");

if (retailAccountingReadiness.includes('readinessStatus === "READY"')) {
  console.error("FAIL Shop canonical accounting readiness: ne doit plus dépendre d’un flag persistant potentiellement périmé.");
  process.exit(1);
}

requireTokens(retailExecution, [
  'assertRetailSaleAccountingPreflight(args.organizationId',
  'catalogItemId: line.catalogItemId',
  'finalizeRetailSaleAccounting(args.organizationId, args.actorUserId, result.sale.id)',
], "Shop canonical accounting");

if (retailExecution.indexOf("assertRetailSaleAccountingPreflight") > retailExecution.indexOf("createRetailSale(args.organizationId")) {
  console.error("FAIL Shop canonical accounting: le préflight doit précéder les effets durables de la vente.");
  process.exit(1);
}

requireTokens(retailPreflight, [
  'const configuration = await assertFinanceReady(tx, organizationId)',
  'await getPostingPeriod(tx, organizationId, accountingDate)',
  'await resolveExchangeRate(tx, {',
  'trackInventory: true',
  'inventoryByCatalogId.get(line.catalogItemId)',
  'RETAIL_INVENTORY_ITEM_REQUIRED',
  'RETAIL_INVENTORY_COST_LAYER_REQUIRED',
  'RETAIL_INVENTORY_VALUATION_CURRENCY_AMBIGUOUS',
  'INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN',
], "Shop Finance preflight");

console.log("PASS #296 Finance production completion contract");
