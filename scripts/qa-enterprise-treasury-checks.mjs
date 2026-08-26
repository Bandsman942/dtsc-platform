import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/payments-service.ts",
  "lib/enterprise/accounting/treasury-service.ts",
  "lib/enterprise/accounting/financial-account-service.ts",
  "lib/enterprise/accounting/treasury-transfer-service.ts",
  "app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/validate/route.ts",
  "app/api/enterprise/[organizationId]/reconciliations/[sessionId]/matches/route.ts",
  "app/api/enterprise/[organizationId]/account-transfers/preview/route.ts",
  "app/api/enterprise/[organizationId]/treasury-history/route.ts",
  "app/api/enterprise/[organizationId]/financial-accounts/[accountId]/route.ts",
  "components/enterprise/professional/enterprise-finance-treasury-workspace.tsx",
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
  "CASH_SESSION_SELF_VALIDATION_FORBIDDEN",
  "TRANSFER_SELF_APPROVAL_FORBIDDEN",
  "UNRECONCILED",
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
  "targetAmount",
  "functionalCurrencyCode",
  "ACCOUNT_TRANSFER_CONFIRMED",
  "TransactionIsolationLevel.Serializable",
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
]);
forbidTokens("components/enterprise/professional/enterprise-finance-treasury-workspace.tsx", [
  "form.get(\"code\")",
  "name=\"targetAmount\"",
  "name=\"exchangeRate\"",
]);
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
