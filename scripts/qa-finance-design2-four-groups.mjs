import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(file, "utf8");
const navigation = read("lib/enterprise/finance-navigation-sections.ts");
const groups = [
  ["FINANCE_STEERING", ["FINANCE_OVERVIEW", "FINANCE_BUDGETS"]],
  ["FINANCE_OPERATIONS", ["FINANCE_RECEIVABLES", "FINANCE_PAYABLES", "FINANCE_PAYMENTS"]],
  ["FINANCE_TREASURY", ["FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"]],
  ["FINANCE_ACCOUNTING", ["FINANCE_ACCOUNTING", "FINANCE_TAX", "FINANCE_CLOSE", "FINANCE_STATEMENTS", "FINANCE_ASSETS", "FINANCE_INVENTORY"]],
];
for (const [group, codes] of groups) {
  assert.match(navigation, new RegExp(`code: "${group}"`));
  for (const code of codes) assert.ok(navigation.includes(`"${code}"`), `${code} missing`);
}

const uiWorkspaces = [
  "components/enterprise/professional/enterprise-finance-overview-workspace.tsx",
  "components/enterprise/core-v2/enterprise-finance-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-payments-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-treasury-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-base.tsx",
  "components/enterprise/professional/enterprise-finance-accounting-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-advanced-workspace.tsx",
  "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx",
];
for (const file of uiWorkspaces) {
  const content = read(file);
  assert.ok(content.includes("FinanceDateFilter"), `${file}: date filter missing`);
  assert.ok(content.includes("FinanceExportControls") || file.includes("overview-workspace.tsx") && content.includes("downloadSnapshot"), `${file}: enterprise export missing`);
}
const dateEndpoints = ["sales-invoices", "supplier-invoices", "sales-credit-notes", "supplier-credit-notes", "receivables", "payables", "payments", "budgets", "expenses", "financial-accounts", "funding-operations", "account-transfers", "cash-sessions", "bank-statements", "reconciliations", "taxes", "financial-close", "financial-statements", "asset-accounting", "journal-entries"];
for (const name of dateEndpoints) {
  const content = read(`app/api/enterprise/[organizationId]/${name}/route.ts`);
  assert.ok(content.includes("financeBusinessDateRange(req)"), `${name}: validated business-date range missing`);
}
const controls = read("components/enterprise/professional/finance-design2-controls.tsx");
for (const token of ["Exact date", "Date précise", 'type="date"', "1000", "downloadProfessionalPdf", "downloadProfessionalXlsx", "downloadProfessionalCsv"]) assert.ok(controls.includes(token), `Finance UI contract: ${token}`);

const importRoute = read("app/api/enterprise/[organizationId]/finance-template-import/route.ts");
assert.ok(importRoute.indexOf("authorizeFinanceRequest") < importRoute.indexOf("req.formData()"), "bulk upload authorization must precede body parsing");
for (const token of ["TransactionIsolationLevel.Serializable", "createTaxCodeTx", "createCustomChildAccountTx", "auditLog.create", 'kind === "tax"']) assert.ok(importRoute.includes(token), `bulk import invariant: ${token}`);
const importUi = read("components/enterprise/professional/finance-template-import-controls.tsx");
for (const token of ["Prévisualiser", "Téléchargez le modèle", "downloadProfessionalXlsx", 'accept=".csv,.xlsx"', "preview.invalid > 0"]) assert.ok(importUi.includes(token), `bulk import UI contract: ${token}`);

const retail = read("lib/enterprise/retail/feature-activation.ts");
assert.ok(retail.includes("FINANCE_READY: finance.ready"), "Retail Finance readiness must use canonical posting readiness");
assert.ok(retail.includes("financeBlockers"), "Retail activation must expose actionable Finance blockers");

console.log(`PASS Finance Design 2.0: ${groups.length} sections / ${groups.reduce((sum, [, modules]) => sum + modules.length, 0)} modules; ${dateEndpoints.length} validated date APIs; safe imports and Retail readiness.`);
