import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/payables-service.ts",
  "lib/enterprise/accounting/supplier-credit-notes-service.ts",
  "app/api/enterprise/[organizationId]/supplier-invoices/route.ts",
  "app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/three-way-match/override/route.ts",
]);
requireTokens("lib/enterprise/accounting/payables-service.ts", [
  "THREE_WAY_MATCH_CURRENCY_MISMATCH",
  "THREE_WAY_MATCH_VARIANCE_UNRESOLVED",
  "SUPPLIER_INVOICE_SELF_REVIEW_FORBIDDEN",
  "SUPPLIER_INVOICE_SELF_APPROVAL_FORBIDDEN",
  "supplierInvoiceId: invoice.id",
  "SUPPLIER_INVOICE_PROJECTION",
]);
requireTokens("lib/enterprise/accounting/supplier-credit-notes-service.ts", [
  "SUPPLIER_CREDIT_NOTE",
  "outstandingAmount",
  "postBusinessEvent",
]);
requireTokens("app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/three-way-match/override/route.ts", [
  "z.object",
  "authorizeFinanceRequest",
  "ENTERPRISE_THREE_WAY_MATCH_OVERRIDDEN",
]);
success("enterprise payables and three-way matching");
