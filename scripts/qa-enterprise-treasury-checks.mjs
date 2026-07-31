import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/payments-service.ts",
  "lib/enterprise/accounting/treasury-service.ts",
  "app/api/enterprise/[organizationId]/cash-sessions/[sessionId]/validate/route.ts",
  "app/api/enterprise/[organizationId]/reconciliations/[sessionId]/matches/route.ts",
]);
requireTokens("lib/enterprise/accounting/payments-service.ts", [
  "PAYMENT_SELF_APPROVAL_FORBIDDEN",
  "PAYMENT_ALLOCATION_EXCEEDS_OPEN_AMOUNT",
  "unallocatedAmount",
  "postBusinessEvent",
]);
requireTokens("lib/enterprise/accounting/treasury-service.ts", [
  "TransactionIsolationLevel.Serializable",
  "CASH_SESSION_REQUIRED",
  "CASH_SESSION_SELF_VALIDATION_FORBIDDEN",
  "ACCOUNT_TRANSFER_SELF_APPROVAL_FORBIDDEN",
  "UNRECONCILED",
]);
requireTokens("app/api/enterprise/[organizationId]/reconciliations/[sessionId]/matches/route.ts", [
  "authorizeFinanceRequest",
  "writeAuditLog",
]);
success("enterprise payments treasury cash and reconciliation");
