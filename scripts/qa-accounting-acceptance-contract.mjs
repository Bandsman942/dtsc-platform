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
const bootstrap = "lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json";

for (const file of [onboarding, close, workflow, bootstrap]) requireFile(file);

requireTokens(onboarding, [
  "390",
  "768",
  "OHADA_SYSCOHADA@0.1.0",
  "FUNCTIONAL_CURRENCY_REQUIRED",
  "OPEN_FISCAL_PERIOD_REQUIRED",
  "REGULATORY_STATEMENT_MAPPING_NOT_VALIDATED",
  "SALES_INVOICE_POSTED",
  "enterprisePostingBatch",
  "APPLY_SAFE_TEMPLATE_UPGRADE",
  "server RBAC rejects a non-member",
  "English tablet onboarding",
]);

requireTokens(close, [
  "financial-close",
  'action: "SUBMIT"',
  'action: "APPROVE"',
  'action: "CLOSE"',
  'toBe("CLOSED")',
  "FINANCE_PERIOD_CLOSED",
  "blockedEntryCount",
  "originalSnapshot",
  "historical.lines",
]);

requireTokens(workflow, [
  "Accounting onboarding & production-like acceptance",
  "pgvector/pgvector:pg16",
  "pnpm prisma:deploy",
  "node scripts/seed-erp-professional-e2e.mjs",
  "node scripts/qa-accounting-program-150-155.mjs",
  "node scripts/qa-accounting-acceptance-contract.mjs",
  "pnpm build",
  "playwright install --with-deps chromium",
  "pnpm exec next start",
  "accounting-onboarding.spec.mjs",
  "accounting-z-close-protection.spec.mjs",
]);

if (exists(workflow)) {
  const content = read(workflow);
  if (/\bnext dev\b|\bpnpm dev\b/.test(content)) failures.push("Accounting acceptance: workflow must exercise the production server, not dev mode");
  if (content.includes("ENABLE_E2E_SERVICE_FALLBACK")) failures.push("Accounting acceptance: service fallback is forbidden in production-like acceptance");
}

if (exists(bootstrap)) {
  const template = JSON.parse(read(bootstrap));
  if (template.code !== "OHADA_SYSCOHADA" || template.version !== "0.1.0") failures.push("Accounting acceptance: expected SYSCOHADA bootstrap 0.1.0");
  if (template.source?.kind !== "DTSC_INTERNAL") failures.push("Accounting acceptance: bootstrap must remain explicitly non-official/DTSC_INTERNAL");
  if ((template.financialStatementMappings || []).length !== 0) failures.push("Accounting acceptance: regulatory statement mappings must remain empty until validated");
}

if (failures.length) {
  console.error(`QA Accounting acceptance contract: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("QA Accounting acceptance contract: OK");
