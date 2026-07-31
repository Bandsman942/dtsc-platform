import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-inventory.prisma",
  "lib/enterprise/inventory/service.ts",
  "lib/enterprise/procurement/common-domain-adapter.ts",
  "app/api/enterprise/[organizationId]/stock-transfers/route.ts",
  "app/api/enterprise/[organizationId]/inventory-counts/route.ts",
  "app/api/enterprise/[organizationId]/purchase-receipts/[receiptId]/post-to-inventory/route.ts",
]);
requireTokens("lib/enterprise/inventory/service.ts", [
  "NEGATIVE_STOCK_FORBIDDEN",
  "Prisma.TransactionIsolationLevel.Serializable",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "idempotencyKey",
  "SELF_APPROVAL_FORBIDDEN",
]);
requireTokens("lib/enterprise/procurement/common-domain-adapter.ts", [
  "PURCHASE_RECEIPT",
  "expectedItemType === \"SERVICE\"",
  "enterprisePurchaseReceiptItemStockLink",
]);
success("enterprise inventory invariants");
