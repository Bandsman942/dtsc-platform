import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/payables-service.ts",
  "lib/enterprise/accounting/supplier-credit-notes-service.ts",
  "lib/enterprise/accounting/core-posting-builders.ts",
  "app/api/enterprise/[organizationId]/supplier-invoices/route.ts",
  "app/api/enterprise/[organizationId]/supplier-invoices/[invoiceId]/three-way-match/override/route.ts",
  "app/api/enterprise/[organizationId]/operational-lookups/route.ts",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  "tests/e2e/erp-cross-module-finance.spec.mjs",
]);
requireTokens("lib/enterprise/accounting/payables-service.ts", [
  "THREE_WAY_MATCH_CURRENCY_MISMATCH",
  "THREE_WAY_MATCH_VARIANCE_UNRESOLVED",
  "SUPPLIER_INVOICE_SELF_REVIEW_FORBIDDEN",
  "SUPPLIER_INVOICE_SELF_APPROVAL_FORBIDDEN",
  "supplierInvoiceId: invoice.id",
  "SUPPLIER_INVOICE_PROJECTION",
  "SUPPLIER_INVOICE_EXPENSE_ACCOUNT_INVALID",
  "allowDirectPosting: true",
  'accountType: { in: ["EXPENSE", "OTHER_EXPENSE"] }',
]);
requireTokens("lib/enterprise/accounting/core-posting-builders.ts", [
  "SUPPLIER_INVOICE_EXPENSE_ACCOUNT_INVALID",
  "include: { items: true }",
  "item.expenseAccountId ? `ACCOUNT_ID:${item.expenseAccountId}` : \"OPERATING_EXPENSE\"",
  "debit: item.netAmount",
  "GOODS_RECEIVED_CLEARING",
  "FIXED_ASSET",
]);
requireTokens("app/api/enterprise/[organizationId]/operational-lookups/route.ts", [
  "expenseAccounts",
  'moduleCode === "FINANCE_PAYABLES"',
  "allowDirectPosting: true",
  'accountType: { in: ["EXPENSE", "OTHER_EXPENSE"] }',
]);
requireTokens("components/enterprise/professional/enterprise-finance-invoices-workspace.tsx", [
  "expenseAccountId",
  "sources.expenseAccounts",
  't("expense")',
  "line.expenseAccountId ? line.expenseAccountId : undefined",
]);
requireTokens("tests/e2e/erp-cross-module-finance.spec.mjs", [
  'code: "6588"',
  "expenseAccountId: selectedExpenseAccount.id",
  "Supplier posting must debit the explicitly selected expense account",
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
success("enterprise payables, expense-account posting and three-way matching");
