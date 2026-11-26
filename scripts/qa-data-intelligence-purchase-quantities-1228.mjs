import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const writes = [];
const tenant = "test-tenant";
const unit = { id: "unit", code: "BT", decimalScale: 6 };
let recordedScale = null;
let recordedCode = null;
let recordedUnitId = unit.id;
let orderedQuantity = "1";
let receivedQuantity = "1";
let expectedItemType = "GOODS";
let existingReceipt = null;
const tx = {
  enterprisePurchaseReceipt: {
    findFirst: async () => ({
      id: "receipt", purchaseId: "order", reference: "REC-TEST",
      items: [{
        id: "receipt-line", purchaseItemId: "purchase-line", quantityReceived: new Prisma.Decimal(receivedQuantity),
        purchaseItem: { quantity: new Prisma.Decimal(orderedQuantity) },
      }],
    }),
  },
  enterprisePurchaseOperationalLink: { findFirst: async () => ({ siteId: "site", destinationWarehouseId: "warehouse" }) },
  enterprisePurchaseReceiptOperationalLink: {
    findFirst: async () => existingReceipt,
    create: async ({ data }) => { writes.push(data); return data; },
  },
  enterprisePurchaseReceiptItemStockLink: {
    findFirst: async () => null,
    create: async ({ data }) => { writes.push(data); return data; },
  },
  enterprisePurchaseItemCatalogLink: { findFirst: async () => ({ catalogItemId: "catalog", unitOfMeasureId: recordedUnitId, unitDecimalScale: recordedScale, unitCodeSnapshot: recordedCode, expectedItemType }) },
  enterpriseCatalogItem: {
    findFirst: async ({ where }) => {
      assert.equal(where.organizationId, tenant);
      assert.equal(where.id, "catalog");
      return { id: "catalog", trackInventory: true, unitOfMeasure: unit };
    },
  },
  enterpriseWarehouse: { findFirst: async () => ({ id: "warehouse", siteId: "site" }) },
  enterpriseInventoryItem: { findFirst: async () => ({ id: "inventory", status: "ACTIVE", lotTracking: true, expiryTracking: false }) },
  enterpriseStockLot: {
    findFirst: async () => null,
    create: async ({ data }) => { writes.push(data); return { id: data.lotNumber }; },
  },
};
const loader = workflowTestLoader({
  "@/lib/prisma": {},
  "@/lib/enterprise/inventory/service": { applyStockMovementTx: async (_tx, _tenant, _actor, data) => {
    writes.push(data);
    return { movement: { id: data.stockLotId } };
  } },
  "@/lib/enterprise/retail/site-access": { requireRetailSiteCapability: async () => {} },
  "@/lib/enterprise/projects-assets/helpers": { publishOperationsEvent: async () => {} },
});
const { postEnterprisePurchaseReceiptToInventoryTx: post } = loader("@/lib/enterprise/procurement/common-domain-adapter");
const { purchaseQuantitySchema } = loader("@/lib/enterprise/procurement/receipt-lot-schema");
const { inventoryQuantityMicrounits, localizeInventoryQuantity } = loader("@/lib/enterprise/inventory/quantity-display");
const batch = (lotNumber, quantity) => ({ lotNumber, quantity, productionDate: null, expiryDate: null });
const receipt = (batches = []) => post(tx, tenant, "receipt", "actor", {
  idempotencyKey: "test-receipt",
  lotAllocations: batches.length ? [{ purchaseItemId: "purchase-line", batches }] : [],
});

for (const invalid of [true, "", "abc", "1e-6", "0.0000001", 1_000_001, 0]) assert.equal(purchaseQuantitySchema.safeParse(invalid).success, false);
assert.equal(purchaseQuantitySchema.parse("0.000001"), "0.000001");
assert.equal(purchaseQuantitySchema.parse(0.000001), 0.000001);
assert.equal(inventoryQuantityMicrounits("0.000003") + inventoryQuantityMicrounits("0.000004"), inventoryQuantityMicrounits("0.000007"));
assert.equal(localizeInventoryQuantity("999999999999999.999999", "fr-FR"), "999 999 999 999 999,999999");

for (let scale = 0; scale <= 6; scale++) {
  unit.decimalScale = scale;
  const valid = scale === 0 ? "1" : `0.${"0".repeat(scale - 1)}1`;
  const invalid = `0.${"0".repeat(scale)}1`;
  receivedQuantity = valid;
  writes.length = 0;
  const result = await receipt([batch("batch", valid)]);
  assert.equal(result.idempotent, false);
  assert.equal(writes.find((row) => row.movementType === "PURCHASE_RECEIPT")?.quantity, valid);

  writes.length = 0;
  const precisionCode = scale === 6 ? "INVENTORY_PHYSICAL_QUANTITY_PRECISION" : "INVENTORY_UNIT_QUANTITY_PRECISION";
  await assert.rejects(receipt([batch("batch", invalid)]), { code: precisionCode });
  receivedQuantity = invalid;
  await assert.rejects(receipt([batch("batch", valid)]), { code: precisionCode });
  assert.deepEqual(writes, []);
}

receivedQuantity = "0.000007";
writes.length = 0;
await receipt([batch("first", "0.000003"), batch("second", "0.000004")]);
assert.deepEqual(writes.filter((row) => row.movementType === "PURCHASE_RECEIPT").map((row) => row.quantity), ["0.000003", "0.000004"]);

writes.length = 0;
recordedUnitId = "former-unit";
await assert.rejects(receipt([batch("batch", receivedQuantity)]), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
recordedUnitId = null;
await assert.rejects(receipt([batch("batch", receivedQuantity)]), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
assert.deepEqual(writes, []);
existingReceipt = { purchaseReceiptId: "receipt", warehouseId: "warehouse" };
assert.equal((await receipt()).idempotent, true, "A replay preserves the original receipt after unit changes");
assert.deepEqual(writes, []);

existingReceipt = null;
recordedUnitId = unit.id;
// An exact integer fits both scales, but this must not bypass the snapshot guard.
recordedScale = 0; recordedCode = "BT";
unit.decimalScale = 6; receivedQuantity = "1";
await assert.rejects(receipt([batch("batch", "1")]), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
assert.deepEqual(writes, []);
recordedScale = 6; recordedCode = "FORMER";
await assert.rejects(receipt([batch("batch", "1")]), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
assert.deepEqual(writes, []);
recordedCode = null;
await assert.rejects(receipt([batch("batch", "1")]), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
assert.deepEqual(writes, []);
recordedCode = "BT";
assert.equal((await receipt([batch("batch", "1")])).idempotent, false);
writes.length = 0;
recordedScale = null; recordedCode = null;
expectedItemType = "SERVICE";
unit.decimalScale = 0;
receivedQuantity = "0.5";
await assert.rejects(receipt(), { code: "INVENTORY_UNIT_QUANTITY_PRECISION" });
assert.deepEqual(writes, []);
receivedQuantity = "1";
assert.equal((await receipt()).results[0].serviceAccepted, true);
assert.equal(writes.some((row) => row.movementType), false);

orderedQuantity = "1.1234";
writes.length = 0;
await assert.rejects(receipt(), { code: "INVENTORY_UNIT_QUANTITY_PRECISION" });
assert.deepEqual(writes, []);

console.log("#1228 purchase receipts: seven unit scales, exact batch sums, services, historical unit changes and immutable replay passed");
