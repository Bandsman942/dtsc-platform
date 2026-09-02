import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "app/api/enterprise/[organizationId]/site-hierarchy/route.ts",
  "app/api/enterprise/[organizationId]/stock-adjustments/route.ts",
  "app/api/enterprise/[organizationId]/stock-adjustments/[adjustmentId]/decision/route.ts",
  "lib/enterprise/inventory/approval.ts",
  "lib/enterprise/inventory/adjustment-service.ts",
  "lib/enterprise/master-data/location-integrity.ts",
  "docs/HOTFIX_560_ERP_SUPPLY_DOCUMENTS_INTEGRITY.md",
]);

requireTokens("lib/enterprise/core-v2/constants.ts", ["PURCHASE_REQUEST"]);
requireTokens("lib/standard-work-coordination/request-i18n.ts", ["PURCHASE_REQUEST: \"Demande d’achat\"", "PURCHASE_REQUEST: \"Purchase request\""]);
requireTokens("lib/enterprise/procurement/validators.ts", ["catalogItemId", "expectedItemType", "destinationSiteId", "destinationWarehouseId", "warehouseId", "storageLocationId"]);
requireTokens("lib/enterprise/procurement/purchase-service.ts", ["APPROVED_PURCHASE_REQUEST_REQUIRED", "requestType: \"PURCHASE_REQUEST\"", "enterprisePurchaseItemCatalogLink", "enterprisePurchaseOperationalLink", "postEnterprisePurchaseReceiptToInventoryTx"]);
requireTokens("lib/enterprise/procurement/common-domain-adapter.ts", ["postEnterprisePurchaseReceiptToInventoryTx", "PURCHASE_RECEIPT", "expectedItemType === \"GOODS\"", "enterprisePurchaseReceiptItemStockLink", "STORAGE_LOCATION_NOT_FOUND"]);
requireTokens("lib/enterprise/sector-convergence/pharmacy-procurement-service.ts", ["catalogItemId: catalogByProduct.get(line.productId)!", "PHARMACY_PRODUCT_MAPPING_REQUIRED"]);

requireTokens("lib/enterprise/inventory/approval.ts", ["assertEnterpriseApprovalCandidate", "assertEnterpriseApprovalDecision", "INVENTORY_LOGISTICS"]);
requireTokens("lib/enterprise/inventory/service.ts", ["assertInventoryApprovalCandidate", "assertInventoryApprovalDecision", "allowNegativeStock", "NEGATIVE_STOCK_FORBIDDEN", "Prisma.TransactionIsolationLevel.Serializable", "EnterpriseStockTransfer", "EnterpriseInventoryCount"]);
requireTokens("lib/enterprise/inventory/adjustment-service.ts", ["assertInventoryApprovalCandidate", "assertInventoryApprovalDecision", "EnterpriseStockAdjustment", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "idempotencyKey"]);
requireTokens("lib/enterprise/inventory/schemas.ts", ["Un motif est obligatoire pour rejeter cette opération."]);
requireTokens("lib/enterprise/approval-targets.ts", ["EnterpriseStockTransfer: \"INVENTORY_LOGISTICS\"", "EnterpriseInventoryCount: \"INVENTORY_LOGISTICS\"", "EnterpriseStockAdjustment: \"INVENTORY_LOGISTICS\""]);
requireTokens("lib/standard-work-coordination/approval-coordination.ts", ["EnterpriseStockTransfer", "EnterpriseInventoryCount", "EnterpriseStockAdjustment", "approvedByUserId: approverUserId"]);
requireTokens("app/api/enterprise/[organizationId]/approvals/[id]/actions/route.ts", ["decideEnterpriseStockTransfer", "decideEnterpriseInventoryCount", "decideEnterpriseStockAdjustment", "APPROVAL_REVIEW_REQUIRED"]);
requireTokens("app/api/enterprise/[organizationId]/approvals/route.ts", ["EnterpriseStockTransfer", "EnterpriseInventoryCount", "EnterpriseStockAdjustment"]);
requireTokens("components/enterprise/core-v2/enterprise-approvals-workspace.tsx", ["approvals.target.stockTransfer", "approvals.target.inventoryCount", "approvals.target.stockAdjustment", "ApprovalCoordinationPanel"]);

requireTokens("components/enterprise/professional/professional-erp-i18n.ts", ["common.loadFailed", "common.loading", "common.page"]);
requireTokens("components/enterprise/professional/enterprise-inventory-operations-workspace.tsx", ["stock-adjustments", "presentation=\"editor\"", "SUBMITTED", "expectedQuantity"]);
requireTokens("lib/enterprise/master-data/location-integrity.ts", ["SITE_HAS_ACTIVE_WAREHOUSES", "WAREHOUSE_HAS_ACTIVE_LOCATIONS", "WAREHOUSE_HAS_STOCK", "LOCATION_HAS_ACTIVE_CHILDREN", "LOCATION_HAS_STOCK"]);
requireTokens("app/api/enterprise/[organizationId]/storage-locations/route.ts", ["pageSize", "skip:", "take:"]);
forbidTokens("app/api/enterprise/[organizationId]/storage-locations/route.ts", ["take: 500"]);
requireTokens("components/enterprise/professional/enterprise-sites-workspace.tsx", ["/site-hierarchy", "presentation=\"editor\""]);

requireTokens("lib/enterprise/procurement/validators.ts", ["enterpriseDocumentArchiveSchema", "reason"]);
requireTokens("lib/enterprise/procurement/document-service.ts", ["DOCUMENT_ARCHIVE", "reason"]);
requireTokens("components/enterprise/core-v2/enterprise-documents-workspace.tsx", ["archiveTarget", "presentation=\"editor\"", "sourceModule", "sourceEntityType", "sourceEntityId"]);
requireTokens("components/enterprise/core-v2/enterprise-purchases-workspace.tsx", ["catalogItemId", "destinationSiteId", "destinationWarehouseId", "presentation=\"editor\"", "FINANCE_PAYABLES"]);
forbidTokens("components/enterprise/core-v2/enterprise-purchases-workspace.tsx", ["/enterprise-modules/FINANCE_BUDGETS?purchaseId="]);

success("hotfix #560 ERP supply, locations, documents, validations and inventory integrity");