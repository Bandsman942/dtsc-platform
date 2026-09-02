import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-inventory.prisma",
  "lib/enterprise/inventory/approval.ts",
  "lib/enterprise/inventory/service.ts",
  "lib/enterprise/procurement/common-domain-adapter.ts",
  "app/api/enterprise/[organizationId]/stock-transfers/route.ts",
  "app/api/enterprise/[organizationId]/inventory-counts/route.ts",
  "app/api/enterprise/[organizationId]/purchase-receipts/[receiptId]/post-to-inventory/route.ts",
]);
requireTokens("lib/enterprise/inventory/service.ts", [
  "NEGATIVE_STOCK_FORBIDDEN",
  "allowNegativeStock",
  "Prisma.TransactionIsolationLevel.Serializable",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "idempotencyKey",
  "assertInventoryApprovalCandidate",
  "assertInventoryApprovalDecision",
]);
requireTokens("lib/enterprise/inventory/approval.ts", [
  "assertEnterpriseApprovalCandidate",
  "assertEnterpriseApprovalDecision",
  "INVENTORY_LOGISTICS",
]);
requireTokens("lib/enterprise/procurement/common-domain-adapter.ts", [
  "PURCHASE_RECEIPT",
  "expectedItemType === \"GOODS\"",
  "enterprisePurchaseReceiptItemStockLink",
]);
await import("./qa-hotfix-560-supply-integrity.mjs");
success("enterprise inventory invariants");
