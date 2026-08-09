import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const requireFile = (file) => { if (!exists(file)) failures.push(`Accounting acceptance: missing ${file}`); };
const requireTokens = (file, tokens) => {
  if (!exists(file)) return;
  const content = read(file);
  for (const token of tokens) if (!content.includes(token)) failures.push(`Accounting acceptance: ${file} missing token ${token}`);
};

const onboarding = "tests/e2e/accounting-onboarding.spec.mjs";
const close = "tests/e2e/accounting-z-close-protection.spec.mjs";
const workflow = ".github/workflows/accounting-acceptance.yml";
const templatePath = "lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json";
const strictPositivePostingFiles = [
  "lib/enterprise/accounting/core-posting-builders.ts",
  "lib/enterprise/accounting/domain-posting-builders.ts",
  "lib/enterprise/accounting/sector-adapters/pharmacy.ts",
];
for (const file of [onboarding, close, workflow, templatePath, ...strictPositivePostingFiles]) requireFile(file);

requireTokens(onboarding, [
  "390", "768", "OHADA_SYSCOHADA@0.1.0", "FUNCTIONAL_CURRENCY_REQUIRED", "OPEN_FISCAL_PERIOD_REQUIRED",
  "ACCOUNTING_TEMPLATE_PRODUCTION_READY", "BALANCE_SHEET", "INCOME_STATEMENT", "IS_SALES_GOODS", "normalBalance",
  "SALES_INVOICE_POSTED", "enterprisePostingBatch", "APPLY_SAFE_TEMPLATE_UPGRADE", "server RBAC rejects a non-member", "English tablet onboarding",
]);
requireTokens(close, ["financial-close", 'action: "SUBMIT"', 'action: "APPROVE"', 'action: "CLOSE"', 'toBe("CLOSED")', "FINANCE_PERIOD_CLOSED", "blockedEntryCount", "originalSnapshot", "historical.lines"]);
requireTokens(workflow, ["Accounting onboarding & production-like acceptance", "pgvector/pgvector:pg16", "pnpm prisma:deploy", "node scripts/seed-erp-professional-e2e.mjs", "node scripts/qa-accounting-program-150-155.mjs", "node scripts/qa-accounting-acceptance-contract.mjs", "pnpm build", "playwright install --with-deps chromium", "pnpm exec next start", "accounting-onboarding.spec.mjs", "accounting-z-close-protection.spec.mjs"]);

if (exists(workflow)) {
  const content = read(workflow);
  if (/\bnext dev\b|\bpnpm dev\b/.test(content)) failures.push("Accounting acceptance: workflow must exercise the production server, not dev mode");
  if (content.includes("ENABLE_E2E_SERVICE_FALLBACK")) failures.push("Accounting acceptance: service fallback is forbidden in production-like acceptance");
}

for (const file of strictPositivePostingFiles) {
  if (!exists(file)) continue;
  if (read(file).includes(".isPositive()")) failures.push(`Accounting acceptance: ${file} must use strict gt(0) checks so +0 never creates a posting line`);
}
requireTokens("lib/enterprise/accounting/core-posting-builders.ts", ["invoice.taxTotal.gt(0)", "credit.taxTotal.gt(0)", "allocated.gt(0)", "payment.unallocatedAmount.gt(0)", "line.debit.gt(0) ? line.debit : line.credit"]);
requireTokens("lib/enterprise/accounting/domain-posting-builders.ts", ["credit.taxTotal.gt(0)", "retained.gt(0)"]);
requireTokens("lib/enterprise/accounting/sector-adapters/pharmacy.ts", ["event.totalValue.gt(0)"]);

if (exists(templatePath)) {
  const template = JSON.parse(read(templatePath));
  if (template.code !== "OHADA_SYSCOHADA" || template.version !== "0.1.0" || template.status !== "PUBLISHED") failures.push("Accounting acceptance: expected published SYSCOHADA 0.1.0");
  if (template.source?.kind !== "OFFICIAL") failures.push("Accounting acceptance: SYSCOHADA 0.1.0 must be classified OFFICIAL in DTSC governance");
  if (!template.languages?.includes("fr") || !template.languages?.includes("en")) failures.push("Accounting acceptance: SYSCOHADA default must support FR and EN");
  const accounts = new Set((template.accounts || []).map((account) => account.code));
  for (const account of template.accounts || []) if (!account.nameFr?.trim() || !account.nameEn?.trim()) failures.push(`Accounting acceptance: account ${account.code} requires FR/EN labels`);
  const mappingKeys = new Set((template.semanticMappings || []).map((mapping) => mapping.mappingKey));
  const expectedFutureSafeMappings = ["SERVICE_REVENUE", "WORK_REVENUE", "RAW_MATERIALS_INVENTORY", "FINISHED_GOODS_INVENTORY", "SOFTWARE_ASSET", "ACCUMULATED_DEPRECIATION", "DEPRECIATION_EXPENSE", "BORROWINGS", "PROVISIONS", "INTEREST_EXPENSE", "INCOME_TAX_EXPENSE", "EQUITY_CAPITAL"];
  for (const key of expectedFutureSafeMappings) if (!mappingKeys.has(key)) failures.push(`Accounting acceptance: future-safe semantic mapping missing ${key}`);
  for (const mapping of template.semanticMappings || []) if (!accounts.has(mapping.accountCode)) failures.push(`Accounting acceptance: mapping ${mapping.mappingKey} points to missing ${mapping.accountCode}`);
  if ((template.semanticMappings || []).length < 40) failures.push("Accounting acceptance: daily cross-sector semantic coverage is too small");
  if ((template.financialStatementMappings || []).length < 20) failures.push("Accounting acceptance: financial statement mapping coverage is too small");
  const statementTypes = new Set((template.financialStatementMappings || []).map((mapping) => mapping.statementType));
  for (const type of ["BALANCE_SHEET", "INCOME_STATEMENT"]) if (!statementTypes.has(type)) failures.push(`Accounting acceptance: missing statement type ${type}`);
  for (const mapping of template.financialStatementMappings || []) {
    if (!["DEBIT", "CREDIT"].includes(mapping.normalBalance)) failures.push(`Accounting acceptance: ${mapping.statementType}:${mapping.lineCode} missing normal balance`);
    if (!mapping.nameFr?.trim() || !mapping.nameEn?.trim()) failures.push(`Accounting acceptance: ${mapping.statementType}:${mapping.lineCode} requires FR/EN labels`);
    for (const accountCode of mapping.accountCodes || []) if (!accounts.has(accountCode)) failures.push(`Accounting acceptance: statement ${mapping.lineCode} points to missing ${accountCode}`);
  }
}

if (failures.length) {
  console.error(`QA Accounting acceptance contract: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("QA Accounting acceptance contract: OK — official default, reporting and production-like safeguards covered");
