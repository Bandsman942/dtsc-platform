import "./qa-hotfix-578-procurement-link-parity.mjs";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const registry = "lib/enterprise/accounting/posting-registry-final.ts";
const posting = "lib/enterprise/accounting/posting-service.ts";
const procurement = "lib/enterprise/accounting/payables-service.ts";
const payroll = "lib/enterprise/accounting/payroll-expense-accounting-service.ts";
const close = "lib/enterprise/accounting/close-service.ts";
const inventory = "lib/enterprise/accounting/inventory-accounting-service.ts";
const assets = "lib/enterprise/accounting/asset-accounting-service.ts";
const health = "lib/enterprise/accounting/sector-adapters/health.ts";
const pharmacy = "lib/enterprise/accounting/sector-adapters/pharmacy.ts";
const supplierPartyConstraintRepair = "prisma/migrations/20260905114000_repair_supplier_party_link_constraints/migration.sql";
const procurementLinkConstraintRepair = "prisma/migrations/20260905133000_repair_procurement_erp_link_constraints/migration.sql";

requirePaths([
  registry,
  posting,
  procurement,
  payroll,
  close,
  inventory,
  assets,
  health,
  pharmacy,
  supplierPartyConstraintRepair,
  procurementLinkConstraintRepair,
  "tests/e2e/accounting-onboarding.spec.mjs",
  "tests/e2e/accounting-z-close-protection.spec.mjs",
  "tests/e2e/erp-cross-module-finance.spec.mjs",
  ".github/workflows/accounting-acceptance.yml",
]);

requireTokens(registry, [
  "SALES_INVOICE_POSTED",
  "SUPPLIER_INVOICE_POSTED",
  "PAYROLL_APPROVED",
  "INVENTORY_RECEIPT_VALUED",
  "INVENTORY_ISSUE_VALUED",
  "ASSET_CAPITALIZED",
  "RETAIL_POS_SALE_POSTED",
  "HEALTH_WRITE_OFF_APPROVED",
  "PHARMACY_CUSTOMER_RETURN",
]);
requireTokens(posting, [
  "assertFinanceReady",
  "idempotencyKey",
  "pg_advisory_xact_lock",
  "TransactionIsolationLevel.Serializable",
  "resolveSemanticPostingAccount",
  "resolveExchangeRate",
  "snapshotExchangeRate",
  "POSTING_NOT_BALANCED",
  "status: \"POSTED\"",
]);
requireTokens(procurement, [
  "postBusinessEvent(organizationId, actorUserId",
  "postingEvent: \"SUPPLIER_INVOICE_POSTED\"",
  "sourceEntityType: \"EnterpriseSupplierInvoice\"",
  "enterprisePayable.upsert",
]);
requireTokens(payroll, [
  "postApprovedClientPayroll",
  "postingEvent: \"PAYROLL_APPROVED\"",
  "sourceEntityType: \"EnterprisePayrollRun\"",
]);
requireTokens(close, [
  "NOT EXISTS",
  "entry.\"sourceEntityType\" = 'EnterprisePayrollRun'",
  "entry.\"postingEvent\" = 'PAYROLL_APPROVED'",
  "entry.status = 'POSTED'",
  "approvedPayrollRuns: Number(approvedPayrollRows[0]?.count || 0)",
]);
requireTokens(inventory, [
  "valueInventoryReceipt",
  "valueInventoryIssue",
  "postingEvent: \"INVENTORY_RECEIPT_VALUED\"",
  "postingEvent: \"INVENTORY_ISSUE_VALUED\"",
  "organizationId_idempotencyKey",
]);
requireTokens(assets, [
  "ASSET_CAPITALIZED",
  "postBusinessEvent",
  "organizationId",
]);
requireTokens(health, [
  "HEALTH_MEDICAL_INVOICE_POSTED",
  "commonEvent: \"SALES_INVOICE_POSTED\"",
  "HEALTH_PATIENT_PAYMENT_CONFIRMED",
  "commonEvent: \"CUSTOMER_PAYMENT_CONFIRMED\"",
  "separatePosting: false",
]);
requireTokens(pharmacy, [
  "PHARMACY_SALE_INVOICED",
  "commonEvent: \"SALES_INVOICE_POSTED\"",
  "PHARMACY_PURCHASE_RECEIVED",
  "commonEvent: \"INVENTORY_RECEIPT_VALUED\"",
  "PHARMACY_SUPPLIER_INVOICE_POSTED",
  "commonEvent: \"SUPPLIER_INVOICE_POSTED\"",
]);
requireTokens(supplierPartyConstraintRepair, [
  "EnterpriseSupplierPartyLink_organizationId_supplierId_key",
  "EnterpriseSupplierPartyLink_organizationId_businessPartyId_key",
  "EnterpriseSupplierPartyLink_organizationId_migrationKey_key",
  "GROUP BY \"organizationId\", \"supplierId\"",
  "GROUP BY \"organizationId\", \"businessPartyId\"",
  "reconcile them before applying #576",
]);
requireTokens(procurementLinkConstraintRepair, [
  "EnterprisePurchaseOperationalLink_organizationId_purchaseId_key",
  "EnterprisePurchaseItemCatalogLink_organizationId_purchaseItemId_key",
  "EnterprisePurchaseReceiptOperationalLink_organizationId_purchaseReceiptId_key",
  "EnterprisePurchaseReceiptOperationalLink_organizationId_idempotencyKey_key",
  "EnterprisePurchaseReceiptItemStockLink_organizationId_purchaseReceiptItemId_key",
  "EnterprisePurchaseReceiptItemStockLink_organizationId_stockMovementId_key",
  "reconcile them before applying #578",
]);
forbidTokens(health, [
  "enterpriseJournalEntry.create",
  "enterprisePostingBatch.create",
  "SYSCOHADA",
  "OHADA_SYSCOHADA",
]);
forbidTokens(pharmacy, [
  "enterpriseJournalEntry.create",
  "enterprisePostingBatch.create",
  "SYSCOHADA",
  "OHADA_SYSCOHADA",
]);
requireTokens(".github/workflows/accounting-acceptance.yml", [
  "erp-cross-module-finance.spec.mjs",
  "accounting-z-close-protection.spec.mjs",
]);

success("ERP cross-module Finance convergence and acceptance contract");
