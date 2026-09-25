import "./qa-hotfix-580-finance-treasury-cash-bank-reconciliation.mjs";
import fs from "node:fs";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/payments-service.ts",
  "lib/enterprise/accounting/treasury-service.ts",
  "lib/enterprise/accounting/treasury-schemas.ts",
  "lib/enterprise/accounting/financial-account-service.ts",
  "lib/enterprise/accounting/treasury-transfer-service.ts",
  "lib/enterprise/accounting/treasury-approval-service.ts",
  "lib/enterprise/accounting/accounting-approval-service.ts",
  "lib/enterprise/accounting/accounting-operations-approval-orchestration.ts",
  "app/api/enterprise/[organizationId]/financial-accounts/route.ts",
  "app/api/enterprise/[organizationId]/account-transfers/route.ts",
  "app/api/enterprise/[organizationId]/account-transfers/[transferId]/transition/route.ts",
  "app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/validate/route.ts",
  "app/api/enterprise/[organizationId]/reconciliations/[sessionId]/matches/route.ts",
  "app/api/enterprise/[organizationId]/account-transfers/preview/route.ts",
  "app/api/enterprise/[organizationId]/treasury-history/route.ts",
  "app/api/enterprise/[organizationId]/financial-accounts/[accountId]/route.ts",
  "components/enterprise/professional/enterprise-finance-treasury-workspace.tsx",
  "components/enterprise/professional/use-operational-finance-collection.ts",
]);
requireTokens("lib/enterprise/accounting/payments-service.ts", [
  "PAYMENT_SELF_APPROVAL_FORBIDDEN",
  "PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED",
  "RECEIVABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID",
  "PAYABLE_ALLOCATION_SCOPE_OR_AMOUNT_INVALID",
  "unallocatedAmount",
  "postBusinessEvent",
]);
requireTokens("lib/enterprise/accounting/treasury-service.ts", [
  "TransactionIsolationLevel.Serializable",
  "CASH_SESSION_ALREADY_ACTIVE",
  "RECONCILIATION_SELF_APPROVAL_FORBIDDEN",
  "UNRECONCILED",
]);
forbidTokens("lib/enterprise/accounting/treasury-service.ts", [
  "export async function createFinancialAccount",
  "export async function createAccountTransfer",
  "export async function approveAccountTransfer",
  "export async function confirmAccountTransfer",
  "accountTransferCreateSchema",
]);
forbidTokens("lib/enterprise/accounting/schemas.ts", [
  "export const financialAccountCreateSchema",
  "export const accountTransferCreateSchema",
  "FINANCIAL_ACCOUNT_TYPES",
]);
requireTokens("lib/enterprise/accounting/treasury-schemas.ts", [
  "export const financialAccountCreateSchema",
  "export const accountTransferPreviewSchema",
  "export const accountTransferSchema",
  "sourceAmount: positiveAmount",
  "approverUserId: id",
]);
forbidTokens("lib/enterprise/accounting/treasury-schemas.ts", [
  "targetAmount: positiveAmount",
  "exchangeRate: positiveAmount",
]);
requireTokens("lib/enterprise/accounting/financial-account-service.ts", [
  "ACCOUNT_CODE_PREFIX",
  "financeReference",
  "FINANCIAL_ACCOUNT_UPDATED",
  "FINANCIAL_ACCOUNT_ARCHIVED",
  "TREASURY_ACCOUNT_BALANCE_NOT_ZERO",
  "TransactionIsolationLevel.Serializable",
]);
requireTokens("lib/enterprise/accounting/treasury-transfer-service.ts", [
  "resolveExchangeRateDetails",
  "snapshotExchangeRate",
  "resolveTransferPostingContext",
  "TRANSFER_JOURNAL_REQUIRED",
  "getPostingPeriod",
  "targetAmount",
  "functionalCurrencyCode",
  "ACCOUNT_TRANSFER_CONFIRMED",
  "TransactionIsolationLevel.Serializable",
]);
requireTokens("lib/enterprise/accounting/treasury-approval-service.ts", [
  "assertEnterpriseApprovalDecision",
  "TRANSFER_SELF_APPROVAL_FORBIDDEN",
  "approveAssignedAccountTransfer",
  "rejectAssignedAccountTransfer",
]);
requireTokens("lib/enterprise/accounting/accounting-approval-service.ts", [
  "ACCOUNTING_SELF_APPROVAL_FORBIDDEN",
  "assertEnterpriseApprovalDecision",
  "createAccountingApprovalAssignment",
]);
requireTokens("lib/enterprise/accounting/accounting-operations-approval-orchestration.ts", [
  "EnterpriseCashSession",
  "requireAccountingApprovalDecision",
  "decideAccountingApproval",
  "validateCashSessionAssignedApproval",
]);

const transferServiceSource = fs.readFileSync("lib/enterprise/accounting/treasury-transfer-service.ts", "utf8");
const balanceDebitIndex = transferServiceSource.indexOf("operationalBalance: { decrement: transfer.sourceAmount }");
const postingPreflightIndex = transferServiceSource.lastIndexOf("const postingContext = await resolveTransferPostingContext", balanceDebitIndex);
if (balanceDebitIndex < 0 || postingPreflightIndex < 0 || postingPreflightIndex > balanceDebitIndex) {
  throw new Error("Treasury transfer posting context must be validated before financial balances are mutated.");
}
const confirmationStart = transferServiceSource.indexOf("export async function confirmTreasuryTransfer");
const confirmationTransactionEnd = transferServiceSource.indexOf("}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });", confirmationStart);
const postCommitConfirmation = confirmationTransactionEnd >= 0 ? transferServiceSource.slice(confirmationTransactionEnd) : "";
if (postCommitConfirmation.includes("enterpriseJournal.findFirst") || postCommitConfirmation.includes("getPostingPeriod(")) {
  throw new Error("Treasury transfer journal/period validation must not first occur after the balance transaction commits.");
}

requireTokens("app/api/enterprise/[organizationId]/financial-accounts/route.ts", [
  "createManagedFinancialAccount",
  "financialAccountCreateSchema",
  "@/lib/enterprise/accounting/treasury-schemas",
]);
requireTokens("app/api/enterprise/[organizationId]/account-transfers/route.ts", [
  "createTreasuryTransfer",
  "accountTransferSchema",
  "@/lib/enterprise/accounting/treasury-schemas",
]);
requireTokens("app/api/enterprise/[organizationId]/account-transfers/[transferId]/transition/route.ts", [
  "approveAssignedAccountTransfer",
  "confirmTreasuryTransfer",
  "transferTransitionSchema",
]);
requireTokens("app/api/enterprise/[organizationId]/account-transfers/preview/route.ts", [
  "authorizeFinanceRequest",
  "accountTransferPreviewSchema",
  "previewTreasuryTransfer",
]);
requireTokens("app/api/enterprise/[organizationId]/treasury-history/route.ts", [
  "EnterpriseTreasuryTransactionWhereInput",
  "financialAccount",
  "transactionType",
  "direction",
  "currencyCode",
  "pagination",
]);
requireTokens("components/enterprise/professional/enterprise-finance-treasury-workspace.tsx", [
  "ProfessionalTabs",
  "history",
  "ContextActions",
  "accountNameHelp",
  "ledgerAccountHelp",
  "sourceAccountHelp",
  "transferPreview",
  "account-transfers/preview",
  "treasury-history",
  "useOperationalFinanceCollection",
  "fetchOperationalFinanceRecord",
  'const endpoint = tab === "accounts" ? "financial-accounts" : tab === "transfers" ? "account-transfers" : "treasury-history"',
]);
requireTokens("components/enterprise/professional/use-operational-finance-collection.ts", [
  "AbortController",
  "signal: controller.signal",
  "return () => controller.abort()",
  "setLoading(true)",
  "setItems([])",
  "setPagination(EMPTY_PAGINATION)",
  "requestError.name === \"AbortError\"",
]);
forbidTokens("components/enterprise/professional/enterprise-finance-treasury-workspace.tsx", [
  "form.get(\"code\")",
  "name=\"targetAmount\"",
  "name=\"exchangeRate\"",
  "setTab(\"transfers\")",
]);

const treasuryWorkspaceSource = fs.readFileSync("components/enterprise/professional/enterprise-finance-treasury-workspace.tsx", "utf8");
const operationalCollectionSource = fs.readFileSync("components/enterprise/professional/use-operational-finance-collection.ts", "utf8");
if (!treasuryWorkspaceSource.includes('setTab(next as "accounts" | "transfers" | "history")')) {
  throw new Error("Treasury tab transition must keep the canonical tab state contract.");
}
if (!operationalCollectionSource.includes("return () => controller.abort()") || !operationalCollectionSource.includes("signal: controller.signal")) {
  throw new Error("Operational Finance collection must abort obsolete list requests when endpoint/filter dependencies change.");
}
if (!operationalCollectionSource.includes('requestError.name === "AbortError"')) {
  throw new Error("Operational Finance collection must ignore aborted stale-request errors.");
}

requireTokens("components/enterprise/professional/enterprise-exchange-rates-workspace.tsx", [
  "sourceCurrencyHelp",
  "targetCurrencyHelp",
  "rateHelp",
  "rateDateHelp",
  "sourceHelp",
  "correctionReasonHelp",
  "ContextActions",
]);
requireTokens("app/api/enterprise/[organizationId]/reconciliations/[sessionId]/matches/route.ts", [
  "authorizeFinanceRequest",
  "writeAuditLog",
]);
success("enterprise payments treasury cash and reconciliation");
