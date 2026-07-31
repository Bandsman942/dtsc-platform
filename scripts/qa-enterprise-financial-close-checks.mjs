import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/close-service.ts",
  "lib/enterprise/accounting/periods.ts",
  "app/api/enterprise/[organizationId]/financial-close/route.ts",
  "app/api/enterprise/[organizationId]/financial-close/[closeId]/transition/route.ts",
]);
requireTokens("lib/enterprise/accounting/close-service.ts", [
  "unbalancedPostedEntries",
  "openCashSessions",
  "pendingReconciliations",
  "unresolvedClearingAccounts",
  "FINANCIAL_CLOSE_SELF_APPROVAL_FORBIDDEN",
  "FINANCIAL_CLOSE_SELF_REOPEN_FORBIDDEN",
  "status: \"CLOSED\"",
]);
requireTokens("lib/enterprise/accounting/periods.ts", [
  "FISCAL_PERIOD_CLOSED",
  "SOFT_CLOSED",
  "LOCKED",
]);
requireTokens("app/api/enterprise/[organizationId]/financial-close/[closeId]/transition/route.ts", [
  "authorizeFinanceRequest",
  "financialCloseTransitionSchema.safeParse",
  "writeAuditLog",
]);
success("enterprise financial close controls");
