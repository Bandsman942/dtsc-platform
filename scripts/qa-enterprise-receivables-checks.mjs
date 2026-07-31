import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/receivables-service.ts",
  "app/api/enterprise/[organizationId]/sales-invoices/route.ts",
  "app/api/enterprise/[organizationId]/sales-credit-notes/route.ts",
  "app/api/enterprise/[organizationId]/payments/[paymentId]/allocations/route.ts",
]);
requireTokens("lib/enterprise/accounting/receivables-service.ts", [
  "SALES_INVOICE_TOTAL_INVALID",
  "SALES_INVOICE_SELF_APPROVAL_FORBIDDEN",
  "salesInvoiceId: invoice.id",
  "EnterpriseReceivableAllocation",
  "CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE",
  "outstandingAmount",
]);
requireTokens("app/api/enterprise/[organizationId]/sales-invoices/route.ts", [
  "authorizeFinanceRequest",
  "salesInvoiceCreateSchema.safeParse",
  "writeAuditLog",
]);
requireTokens("app/api/enterprise/[organizationId]/payments/[paymentId]/allocations/route.ts", [
  "authorizeFinanceRequest",
  "paymentAllocationSchema.safeParse",
]);
success("enterprise receivables lifecycle");
