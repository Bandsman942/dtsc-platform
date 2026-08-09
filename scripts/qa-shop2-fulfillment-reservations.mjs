import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const reservations = read("lib/enterprise/inventory/reservations.ts");
for (const marker of [
  "consumeEnterpriseInventoryReservationsTx",
  "INVENTORY_RESERVATION_FULFILLMENT_EXCEEDED",
  'movementType: "SALE_FULFILLMENT"',
  'direction: "OUT"',
  'status: fullyConsumed ? "FULFILLED" : "ACTIVE"',
  "fulfilledQuantity: nextFulfilled",
  "applyStockMovementTx",
]) check(reservations.includes(marker), `Reservation fulfillment contract missing ${marker}`);

const fulfillment = read("lib/enterprise/crm-sales/fulfillments.ts");
for (const marker of [
  "enterpriseRetailOrderOrchestration.findFirst",
  "RETAIL_FULFILLMENT_WAREHOUSE_MISMATCH",
  "consumeEnterpriseInventoryReservationsTx",
  "catalogItem?.trackInventory",
  "TransactionIsolationLevel.Serializable",
  'status: fullyFulfilled ? "FULFILLED" : partiallyFulfilled ? "PARTIALLY_FULFILLED"',
]) check(fulfillment.includes(marker), `Canonical fulfillment integration missing ${marker}`);

check(!fulfillment.includes("enterpriseInventoryBalance.update"), "Fulfillment must not bypass the canonical Inventory stock movement service");

if (failures.length) {
  console.error("Shop 2 fulfillment/reservation QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 fulfillment/reservation QA passed: canonical fulfillment consumes common Inventory reservations atomically.");
