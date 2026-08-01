import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "docs/ERP_PHARMACY_CONVERGENCE_MAP.md",
  "prisma/enterprise-sector-convergence.prisma",
  "prisma/enterprise-sector-convergence-links.prisma",
  "lib/enterprise/sector-convergence/pharmacy-party-service.ts",
  "lib/enterprise/sector-convergence/pharmacy-catalog-service.ts",
  "lib/enterprise/sector-convergence/pharmacy-procurement-service.ts",
  "scripts/backfill-pharmacy-business-parties.mjs",
  "scripts/backfill-pharmacy-catalog-items.mjs",
  "scripts/backfill-pharmacy-purchases.mjs",
]);
requireTokens("prisma/enterprise-sector-convergence.prisma", [
  "model PharmacyProductExtension",
  "model PharmacySupplierExtension",
  "model PharmacyPurchaseExtension",
  "model EnterpriseSectorSyncState",
  "@@unique([organizationId, pharmacyProductId])",
  "@@unique([organizationId, pharmacySupplierId])",
]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-party-service.ts", [
  "pharmacySupplierId",
  "enterpriseBusinessParty.create",
  "enterpriseSupplier.create",
  "TransactionIsolationLevel.Serializable",
  "PHARMACY_SUPPLIER_MAPPING_AMBIGUOUS",
]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-catalog-service.ts", [
  "pharmacyProductId",
  "enterpriseCatalogItem.create",
  "enterpriseInventoryItem.create",
  "PHARMACY_PRODUCT_MAPPING_AMBIGUOUS",
]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-procurement-service.ts", [
  "EnterprisePurchase",
  "PharmacyReceiptExtension",
  "PHARMACY_RECEIPT_LINE_AMBIGUOUS",
  "organizationId",
]);
forbidTokens("lib/enterprise/sector-convergence/pharmacy-party-service.ts", [
  "findFirst({ where: { name:",
  "contains: source.name",
  "similarity(",
]);
success("Pharmacy core convergence invariants");
