import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "docs/ERP_SECTOR_FINANCIAL_MAPPING.md",
  "lib/enterprise/sector-convergence/pharmacy-finance-service.ts",
  "lib/enterprise/sector-convergence/pharmacy-inventory-accounting.ts",
  "lib/enterprise/accounting/sector-adapters/pharmacy.ts",
  "scripts/backfill-pharmacy-financial-links.mjs",
]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-finance-service.ts", [
  "PharmacyInvoiceExtension",
  "PharmacyPaymentExtension",
  "PharmacyCashExtension",
  "createEnterprisePayment",
  "pharmacy-sale-customer:",
  "PHARMACY_CASH_FINANCIAL_ACCOUNT_REQUIRED",
]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-inventory-accounting.ts", [
  "EnterpriseSectorInventoryEvent",
  "sectorIdempotencyKey",
  "regulatoryQuantityAuthority",
  "valueInventoryReceipt",
  "valueInventoryIssue",
]);
requireTokens("lib/enterprise/accounting/sector-adapters/pharmacy.ts", [
  "PHARMACY_LOSS",
  "PHARMACY_EXPIRY_WRITE_OFF",
  "PHARMACY_RECALL_WRITE_OFF",
  "buildPharmacySectorInventoryPosting",
]);
forbidTokens("lib/enterprise/sector-convergence/pharmacy-finance-service.ts", [
  "prisma[sourceEntityType]",
  "eval(",
  "new Function(",
  "customerId:",
]);
success("Pharmacy financial convergence invariants");
