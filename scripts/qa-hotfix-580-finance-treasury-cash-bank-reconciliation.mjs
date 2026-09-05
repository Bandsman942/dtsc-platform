import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens, scope) => {
  for (const token of tokens) ok(source.includes(token), `${scope}: missing ${token}`);
};

const operational = read("components/enterprise/professional/enterprise-operational-finance-workspace.tsx");
const treasuryUi = read("components/enterprise/professional/enterprise-finance-treasury-workspace-hotfix.tsx");
const cashUi = read("components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix.tsx");
const referenceUi = read("components/enterprise/core-v2/finance-reference-select.tsx");
const accountsRoute = read("app/api/enterprise/[organizationId]/financial-accounts/route.ts");
const transfersRoute = read("app/api/enterprise/[organizationId]/account-transfers/route.ts");
const transferTransition = read("app/api/enterprise/[organizationId]/account-transfers/[transferId]/transition/route.ts");
const cashRoute = read("app/api/enterprise/[organizationId]/cash-sessions/route.ts");
const bankRoute = read("app/api/enterprise/[organizationId]/bank-statements/route.ts");
const reconciliationRoute = read("app/api/enterprise/[organizationId]/reconciliations/route.ts");
const reconciliationDetail = read("app/api/enterprise/[organizationId]/reconciliations/[sessionId]/route.ts");
const treasuryLookups = read("app/api/enterprise/[organizationId]/treasury-lookups/route.ts");
const treasuryService = read("lib/enterprise/accounting/treasury-service.ts");
const transferSchema = read("lib/enterprise/accounting/treasury-schemas.ts");
const financeContract = read("lib/ai/tools/finance-contract.ts");

hasAll(operational, [
  "EnterpriseFinanceTreasuryWorkspaceHotfix",
  "EnterpriseFinanceCashBankReconciliationWorkspaceHotfix",
  'props.definition.code === "FINANCE_TREASURY"',
  '["FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"]',
], "operational routing");

for (const [name, source] of [["Treasury hotfix", treasuryUi], ["Cash/Bank/Reconciliation hotfix", cashUi]]) {
  hasAll(source, ['presentation="editor"', "useToastMessage", "disabled={busy}", "FinanceReferenceSelect"], name);
  ok(!source.includes("MANAGER_ROLES"), `${name}: local role grants are forbidden`);
}

hasAll(treasuryUi, [
  "fetchOperationalFinanceRecord",
  "account-transfers/preview",
  'action: "APPROVE"',
  'action: "REJECT"',
  'action: "CONFIRM"',
  "capabilities?.canApprove",
  "capabilities?.canReject",
  "capabilities?.canConfirm",
], "Treasury hotfix");

hasAll(cashUi, [
  "fetchOperationalFinanceRecord",
  "DENOMINATION_ROWS",
  "cashCounts(form)",
  "countedClosingAmount: counted.countedClosingAmount",
  "counts: counted.counts",
  'moduleCode="FINANCE_CASH" kind="financial-account"',
  'moduleCode="FINANCE_RECONCILIATION" kind="reconciliation-payment"',
  'moduleCode="FINANCE_RECONCILIATION" kind="treasury-transaction"',
  'moduleCode="FINANCE_RECONCILIATION" kind="journal-entry"',
  "capabilities?.canValidate",
  "capabilities?.canMatch",
  "capabilities?.canSubmit",
  "capabilities?.canApprove",
], "Cash/Bank/Reconciliation hotfix");

for (const [name, source] of [["cash", cashRoute], ["bank", bankRoute], ["reconciliation", reconciliationRoute]]) {
  hasAll(source, ["financeListParams(req)", "search", "recordId", "organizationId"], `${name} server list`);
}

hasAll(accountsRoute, ["recordId", "auth.access.capabilities", "canEdit", "canArchive"], "financial account capabilities");
hasAll(transfersRoute, ["recordId", "auth.access.capabilities", "approverUserId === auth.session.userId", "canApprove", "canReject", "canConfirm"], "transfer capabilities");
hasAll(transferTransition, ["approveAssignedAccountTransfer", "rejectAssignedAccountTransfer", "confirmTreasuryTransfer"], "transfer assigned decisions");
hasAll(transferSchema, ['z.literal("REJECT")', "reason: z.string().trim().min(4)"], "transfer rejection schema");

hasAll(reconciliationRoute, [
  'status: { in: ["DRAFT", "IN_PROGRESS"] }',
  "item.preparedByUserId === auth.session.userId",
  'item.status === "PENDING_VALIDATION" && assignedIds.has(item.id)',
], "reconciliation state/capability contract");
hasAll(reconciliationDetail, ["pendingApproval", "approverUserId === auth.session.userId", "canMatch", "canSubmit", "canApprove", "canReject"], "reconciliation exact deep link capabilities");

hasAll(treasuryLookups, [
  "const take = 30",
  'requestedModule === "FINANCE_CASH" ? { accountType: "CASH" }',
  '"reconciliation-payment"',
  '"treasury-transaction"',
  '"journal-entry"',
  'financialAccountId: parentId',
  'reconciliationStatus: "UNRECONCILED"',
  'status: "POSTED"',
], "searchable treasury references");
hasAll(referenceUi, [
  '"ledger-account"',
  '"member"',
  '"site"',
  '"currency"',
  '"bank-statement"',
  '"reconciliation-payment"',
  '"treasury-transaction"',
  '"journal-entry"',
  "setTimeout",
], "FinanceReferenceSelect treasury coverage");

hasAll(treasuryService, [
  'FOR UPDATE`)',
  'reconciliationStatus: "UNMATCHED"',
  'reconciliationStatus: "UNRECONCILED"',
  'status: "CONFIRMED"',
  'status: "POSTED"',
  "RECONCILIATION_BANK_LINE_INVALID",
  "RECONCILIATION_TRANSACTION_INVALID",
  "RECONCILIATION_PAYMENT_INVALID",
  "RECONCILIATION_JOURNAL_ENTRY_INVALID",
  "RECONCILIATION_AMOUNT_EXCEEDS_BANK_LINE",
], "reconciliation target validation");
hasAll(treasuryService, [
  "transaction.paymentId !== input.paymentId",
  "const resolvedPaymentId = input.paymentId || transaction?.paymentId || null",
  "RECONCILIATION_LINKED_PAYMENT_INVALID",
  "paymentId: payment?.id || null",
  'data: { status: "RECONCILED", reconciledAt: new Date(), revision: { increment: 1 } }',
], "reconciliation payment propagation");

for (const [tool, moduleCode] of [
  ["FINANCE_TREASURY_READ", "FINANCE_TREASURY"],
  ["FINANCE_CASH_READ", "FINANCE_CASH"],
  ["FINANCE_BANK_READ", "FINANCE_BANK"],
  ["FINANCE_RECONCILIATION_READ", "FINANCE_RECONCILIATION"],
]) {
  ok(financeContract.includes(`code: "${tool}", moduleCode: "${moduleCode}"`), `AI Finance contract: ${tool} must remain mapped to ${moduleCode}`);
}

if (failures.length) {
  console.error(`Hotfix #580 QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Hotfix #580 Finance Treasury/Cash/Bank/Reconciliation QA: OK");
