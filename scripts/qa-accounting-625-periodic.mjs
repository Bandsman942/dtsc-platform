import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const containsAll = (text, markers, label) => markers.forEach((marker) => check(text.includes(marker), `${label} missing ${marker}`));

const schemaPath = "prisma/enterprise-accounting-periodic.prisma";
const migrationPath = "prisma/migrations/20260912193000_accounting_c4_periodic/migration.sql";
const servicePath = "lib/enterprise/accounting/periodic-accounting-service.ts";
const schemasPath = "lib/enterprise/accounting/periodic-accounting-schemas.ts";
const reversalPath = "lib/enterprise/accounting/reversal-service.ts";
const panelPath = "components/enterprise/professional/periodic-accounting-panel.tsx";
const pageComponentPath = "components/enterprise/enterprise-periodic-accounting-page.tsx";
const pageRoutePath = "app/enterprise-modules/FINANCE_ACCOUNTING/periodic-accounting/page.tsx";
const financePagePath = "components/enterprise/enterprise-finance-module-page.tsx";
const docsPath = "docs/ACCOUNTING_625_PERIODIC.md";
const apiPaths = [
  "app/api/enterprise/[organizationId]/periodic-accounting/route.ts",
  "app/api/enterprise/[organizationId]/periodic-accounting/[templateId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/periodic-accounting/[templateId]/versions/route.ts",
  "app/api/enterprise/[organizationId]/periodic-accounting/[templateId]/execute/route.ts",
];
for (const file of [schemaPath, migrationPath, servicePath, schemasPath, reversalPath, panelPath, pageComponentPath, pageRoutePath, financePagePath, docsPath, ...apiPaths]) check(exists(file), `Missing Accounting C4 file ${file}`);

const schema = read(schemaPath);
containsAll(schema, [
  "model EnterprisePeriodicAccountingTemplate",
  "model EnterprisePeriodicAccountingTemplateLine",
  "model EnterprisePeriodicAccountingExecution",
  "@@unique([organizationId, code, version])",
  "@@unique([organizationId, occurrenceKey])",
  "allocationPercent",
  "businessPartyId",
  "projectId",
  "departmentId",
  "siteId",
  "autoReverse",
  "reversalEntryId",
], "Periodic Prisma schema");
check(!schema.includes("PeriodicLedger"), "C4 must not create a parallel periodic ledger");
check(!schema.includes("AccountingBalance"), "C4 must not create a parallel accounting balance");

const migration = read(migrationPath);
containsAll(migration, [
  'CREATE TABLE "EnterprisePeriodicAccountingTemplate"',
  'CREATE TABLE "EnterprisePeriodicAccountingTemplateLine"',
  'CREATE TABLE "EnterprisePeriodicAccountingExecution"',
  'EnterprisePeriodicAccountingExecution_organizationId_occurrenceKey_key',
], "Periodic migration");

const schemas = read(schemasPath);
containsAll(schemas, ["RECURRING", "ACCRUAL", "DEFERRAL", "ALLOCATION", "MONTHLY", "QUARTERLY", "YEARLY", "MANUAL", "ALLOCATION_MUST_TOTAL_100"], "Periodic input contract");

const service = read(servicePath);
containsAll(service, [
  "TransactionIsolationLevel.Serializable",
  "getPostingPeriod(tx, organizationId, input.accountingDate)",
  'status !== "ACTIVE"',
  "organizationId_occurrenceKey",
  "validateAccountingDimensions",
  "allowDirectPosting",
  'status: "POSTED"',
  "reverseJournalEntryTx",
  'authorization: "APPROVED_PERIODIC_TEMPLATE"',
  'status: "OPEN"',
  'fiscalYear: { status: "OPEN" }',
  "SUPERSEDED",
  "PENDING_APPROVAL",
  "PERIODIC_ACCOUNTING_TEMPLATE_SELF_APPROVAL_FORBIDDEN",
  "PERIODIC_ACCOUNTING_FUNCTIONAL_CURRENCY_REQUIRED",
], "Periodic accounting service");
check(!service.includes("prisma.$transaction(async (tx) => {\n      return reverseJournalEntry"), "Periodic execution must not nest a Prisma reversal transaction");

const reversal = read(reversalPath);
containsAll(reversal, ["reverseJournalEntryTx", "APPROVED_PERIODIC_TEMPLATE", "enterpriseJournalReversal.findFirst", "reversalOfEntryId"], "Journal reversal transaction helper");

const queryService = read("lib/enterprise/accounting/accounting-query-service.ts");
containsAll(queryService, ["LEDGER_BEARING_ENTRY_STATUSES", '"POSTED", "REVERSED"'], "Accounting query ledger-bearing status contract");
const statements = read("lib/enterprise/accounting/statements-service.ts");
check((statements.match(/status IN \('POSTED', 'REVERSED'\)/g) || []).length >= 3, "Financial statements must retain REVERSED originals in ledger history");
const regulatory = read("lib/enterprise/accounting/regulatory-statements-service.ts");
check(regulatory.includes("status IN ('POSTED', 'REVERSED')"), "Regulatory statements must retain REVERSED originals in ledger history");

for (const route of apiPaths) {
  const content = read(route);
  check(content.includes('"FINANCE_ACCOUNTING"'), `${route} must authorize FINANCE_ACCOUNTING`);
  check(content.includes("authorizeFinanceRequest"), `${route} must use canonical Finance authorization`);
}
const executeRoute = read(apiPaths[3]);
check(executeRoute.includes('"post"'), "Periodic execution must require Finance post capability");
const transitionRoute = read(apiPaths[1]);
containsAll(transitionRoute, ['"approve"', '"submit"', '"manage"'], "Periodic transition capabilities");

const panel = read(panelPath);
containsAll(panel, ["Comptabilité périodique", "Periodic accounting", "RECURRING", "ACCRUAL", "DEFERRAL", "ALLOCATION", "/periodic-accounting", "autoReverse"], "Periodic workspace panel");
check(!panel.includes("window.prompt"), "Periodic workspace must not use window.prompt");

const pageComponent = read(pageComponentPath);
containsAll(pageComponent, ["PeriodicAccountingPanel", 'moduleCode: "FINANCE_ACCOUNTING"', "resolveEnterpriseModuleCapabilities", "canCreate={capabilities.canCreate}", "canSubmit={capabilities.canSubmit}", "canApprove={capabilities.canApprove}", "canManage={capabilities.canManage}"], "Periodic Accounting page capability contract");
const pageRoute = read(pageRoutePath);
check(pageRoute.includes("EnterprisePeriodicAccountingPage"), "Accounting periodic route must render the protected periodic page");
const financePage = read(financePagePath);
containsAll(financePage, ["CalendarClock", "/enterprise-modules/FINANCE_ACCOUNTING/periodic-accounting", "Comptabilité périodique", "Periodic accounting"], "Accounting module navigation to periodic workspace");

const parity = read("scripts/qa-enterprise-finance-migration-parity.mjs");
check(parity.includes("enterprise-accounting-periodic.prisma"), "Finance migration parity must include the C4 schema");
const migrationWorkflow = read(".github/workflows/generate-enterprise-accounting-migration.yml");
check(migrationWorkflow.includes('prisma/enterprise-accounting-periodic.prisma'), "Accounting migration workflow must watch C4 schema changes");

if (failures.length) {
  console.error("Accounting C4 periodic QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Accounting C4 periodic QA passed.");
