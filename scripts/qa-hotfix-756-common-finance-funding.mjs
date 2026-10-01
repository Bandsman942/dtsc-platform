import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function check(condition, message) { if (!condition) failures.push(message); }
function requireTokens(file, tokens) {
  const content = read(file);
  for (const token of tokens) check(content.includes(token), `${file} missing ${token}`);
  return content;
}

const schema = requireTokens("prisma/enterprise-accounting.prisma", [
  "model EnterpriseFundingOperation",
  "fundingType",
  "financialAccountId",
  "cashSessionId",
  "counterpartyLedgerAccountId",
  "idempotencyKey",
  "fundingOperationId",
]);
check(exists("prisma/migrations/20261001201000_common_finance_funding_flows/migration.sql"), "Funding migration is missing");
const migration = read("prisma/migrations/20261001201000_common_finance_funding_flows/migration.sql");
for (const token of ["CREATE TABLE \"EnterpriseFundingOperation\"", "EnterpriseTreasuryTransaction", "EnterpriseCashMovement", "FOREIGN KEY", "CREATE UNIQUE INDEX"]) check(migration.includes(token), `Funding migration missing ${token}`);

requireTokens("lib/enterprise/accounting/constants.ts", [
  "FUNDING_TYPES",
  "CAPITAL_CONTRIBUTION",
  "SHAREHOLDER_ADVANCE",
  "LOAN_DRAW",
  "CAPITAL_CONTRIBUTION_CONFIRMED",
  "SHAREHOLDER_ADVANCE_CONFIRMED",
  "LOAN_DRAW_CONFIRMED",
]);

const service = requireTokens("lib/enterprise/accounting/funding-service.ts", [
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
  "assertIndependentActor",
  "postBusinessEventTx",
  "reverseJournalEntryTx",
  'authorization: "DOMAIN_INVERSE"',
  'status: "OPEN"',
  'transactionType: "FUNDING"',
  'transactionType: "FUNDING_REVERSAL"',
  'movementType: "FUNDING"',
  'movementType: "FUNDING_REVERSAL"',
  "TransactionIsolationLevel.Serializable",
]);
check(!service.includes("SALES_REVENUE") && !service.includes("SERVICE_REVENUE"), "Funding service must never recognize revenue");

const builder = requireTokens("lib/enterprise/accounting/domain-posting-builders.ts", [
  "buildFundingOperationPosting",
  '"EQUITY_CAPITAL"',
  '"BORROWINGS"',
  "ACCOUNT_ID:",
  'sourceEntityType: "EnterpriseFundingOperation"',
]);
check(!builder.slice(builder.indexOf("buildFundingOperationPosting"), builder.indexOf("buildBankChargePosting")).includes("REVENUE"), "Funding posting builder must not use revenue mappings");
requireTokens("lib/enterprise/accounting/posting-registry-final.ts", [
  "CAPITAL_CONTRIBUTION_CONFIRMED: buildFundingOperationPosting",
  "SHAREHOLDER_ADVANCE_CONFIRMED: buildFundingOperationPosting",
  "LOAN_DRAW_CONFIRMED: buildFundingOperationPosting",
]);

for (const route of [
  "app/api/enterprise/[organizationId]/funding-operations/route.ts",
  "app/api/enterprise/[organizationId]/funding-operations/[fundingOperationId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/funding-operations/[fundingOperationId]/reverse/route.ts",
]) {
  requireTokens(route, ["authorizeFinanceRequest", '"FINANCE_TREASURY"', "writeAuditLog", "writeApiLog"]);
}

requireTokens("app/api/enterprise/[organizationId]/treasury-lookups/route.ts", [
  '"cash-session"',
  '"funding-counterpart-account"',
  'accountType: "LIABILITY"',
  'status: "OPEN"',
]);
requireTokens("app/api/enterprise/[organizationId]/treasury-history/route.ts", ["fundingOperation"]);

const panel = requireTokens("components/enterprise/professional/enterprise-finance-funding-panel.tsx", [
  "FinanceReferenceSelect",
  "EnterpriseApproverSelect",
  'kind="cash-session"',
  'kind="funding-counterpart-account"',
  'presentation="editor"',
  "useToastMessage",
  "safeFinanceError",
  "fundingNonRevenueNotice",
]);
check(!panel.includes('name="financialAccountUuid"') && !panel.includes('placeholder="UUID'), "Funding UI must not expose UUID inputs");

requireTokens("components/enterprise/professional/enterprise-finance-treasury-workspace.tsx", [
  '"funding"',
  "EnterpriseFinanceFundingPanel",
  "fundingOperationId",
]);
requireTokens("lib/i18n/enterprise-treasury.ts", [
  "capitalContribution",
  "shareholderAdvance",
  "loanDraw",
  "fundingNonRevenueNotice",
  "rejectFunding",
]);
requireTokens("components/enterprise/professional/finance-professional-ui.ts", [
  "CAPITAL_CONTRIBUTION",
  "SHAREHOLDER_ADVANCE",
  "LOAN_DRAW",
  "FUNDING_CASH_SESSION_REQUIRED",
  "FUNDING_CONFIRMATION_ACTOR_FORBIDDEN",
]);

requireTokens("lib/enterprise/approval-targets.ts", [
  "EnterpriseFundingOperation",
  "fundingOperationId",
]);
requireTokens("lib/ai/tools/executors/finance.ts", [
  "FINANCE_TREASURY_READ",
  "fundingOperation",
  "fundingType",
]);
requireTokens("lib/enterprise/approval-presentation.ts", [
  "enterpriseFundingOperation.findMany",
  "EnterpriseFundingOperation:",
]);
requireTokens("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", [
  "approveAssignedFundingOperation",
  "rejectAssignedFundingOperation",
  '"EnterpriseFundingOperation"',
]);
requireTokens("components/enterprise/core-v2/enterprise-approvals-workspace.tsx", ['"EnterpriseFundingOperation"']);
requireTokens("lib/standard-work-coordination/approval-coordination.ts", ["enterpriseFundingOperation.findFirst"]);

const syscohada = JSON.parse(read("lib/enterprise/accounting/templates/syscohada/syscohada.bootstrap.v0.1.0.json"));
const mappings = new Map((syscohada.semanticMappings || []).map((mapping) => [mapping.mappingKey, mapping.accountCode]));
check(mappings.get("EQUITY_CAPITAL") === "101", "Published SYSCOHADA capital mapping must remain 101");
check(mappings.get("BORROWINGS") === "162", "Published SYSCOHADA borrowings mapping must remain 162");
check(!mappings.has("SHAREHOLDER_ADVANCES"), "Published SYSCOHADA bootstrap must not be mutated for shareholder advances");

check(schema.includes("@@unique([organizationId, idempotencyKey])"), "Funding idempotency uniqueness must remain tenant scoped");

if (failures.length) {
  console.error("Hotfix #756 funding QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Hotfix #756 funding QA passed.");
