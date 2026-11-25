import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const unit = { exports: {} };
  cache.set(path, unit.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: unit, exports: unit.exports, require: name => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name),
  }, { filename: path });
  return unit.exports;
}
const { requireInventoryQuantity: quantity, addInventoryQuantities: add, convertInventoryQuantity: convert } = load("lib/enterprise/inventory/quantity-policy.ts");
const { formatInventoryQuantity: format, inventoryQuantityExportValue: exportQuantity } = load("lib/enterprise/inventory/quantity-display.ts");
const { planFefoLots, readReservationLotAllocations } = load("lib/enterprise/inventory/lot-allocation.ts");
const { Decimal } = Prisma;

for (let scale = 0; scale <= 6; scale++) {
  const valid = scale === 0 ? "2" : `2.${"0".repeat(scale - 1)}1`;
  assert.equal(quantity(valid, scale).toFixed(), valid);
  assert.equal(quantity("0", scale).toFixed(), "0");
  const invalid = `2.${"0".repeat(scale)}1`;
  assert.throws(() => quantity(invalid, scale), { code: scale === 6 ? "INVENTORY_PHYSICAL_QUANTITY_PRECISION" : "INVENTORY_UNIT_QUANTITY_PRECISION" });
  assert.throws(() => quantity("0", scale, { positive: true }), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
}
assert.equal(quantity("999999999999999.999999", 6).toFixed(), "999999999999999.999999");
assert.equal(add("999999999999999.999998", "0.000001").toFixed(), "999999999999999.999999");
assert.equal(add("5", "-0.123456").toFixed(), "4.876544");
assert.equal(quantity("-0.123456", 6, { signed: true }).toFixed(), "-0.123456");
for (const bad of ["1000000000000000", "-1", "Infinity", "NaN", "0.0000001"]) {
  assert.throws(() => quantity(bad, 6), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
}
for (const scale of [-1, 7, 1.5, undefined]) assert.throws(() => quantity("1", scale), { code: "INVENTORY_UNIT_QUANTITY_PRECISION" });
assert.equal(convert("1.234567", "1000", 3).toFixed(), "1234.567");
assert.equal(convert("-1.5", "2", 0).toFixed(), "-3");
assert.throws(() => convert("0.000001", "0.1", 6), { code: "INVENTORY_PHYSICAL_QUANTITY_PRECISION" });
assert.throws(() => convert("1.5", "1", 0), { code: "INVENTORY_UNIT_QUANTITY_PRECISION" });
for (const factor of ["0", "-1", "NaN"]) assert.throws(() => convert("1", factor, 6), { code: "INVENTORY_UNIT_CONVERSION_INVALID" });
const historical = new Decimal("1.123456");
assert.equal(format(historical, 0).value, "1.123456");
assert.equal(format(historical, 0).precisionMismatch, true);
assert.equal(historical.toFixed(), "1.123456");
assert.equal(exportQuantity("999999999999999.999999"), "999999999999999.999999");
assert.equal(exportQuantity("1234.123456"), 1234.123456);
assert.equal(exportQuantity("0.000001"), 0.000001);

const candidate = { id: "batch-A", status: "AVAILABLE", expiryDate: null, quantityOnHand: new Decimal("1"), quantityReserved: new Decimal("0") };
const allocation = planFefoLots({ candidates: [candidate], quantity: "0.000001", businessDate: "2026-11-25", expiryMode: "BLOCK" });
assert.equal(allocation.allocations[0].quantity.toFixed(), "0.000001");
assert.equal(allocation.shortfall.toFixed(), "0");
assert.throws(() => planFefoLots({ candidates: [candidate], quantity: "0.0000001", businessDate: "2026-11-25", expiryMode: "BLOCK" }));
const snapshot = { quantity: new Decimal("0.000001"), fulfilledQuantity: new Decimal(0), lotAllocations: [{ balanceId: "balance-A", stockLotId: "batch-A", storageLocationId: null, quantity: "0.000001", fulfilledQuantity: "0" }] };
assert.equal(readReservationLotAllocations(snapshot)[0].quantity, "0.000001");
assert.throws(() => readReservationLotAllocations({ ...snapshot, lotAllocations: [{ ...snapshot.lotAllocations[0], quantity: "0.0000001" }] }));
const { stockMovementCreateSchema } = load("lib/enterprise/inventory/schemas.ts");
const { receiptLotAllocationsSchema } = load("lib/enterprise/procurement/receipt-lot-schema.ts");
const move = { inventoryItemId: "item", warehouseId: "warehouse", movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: 0.000001, idempotencyKey: "precision-test" };
assert.equal(stockMovementCreateSchema.safeParse(move).success, true);
const invalidMove = stockMovementCreateSchema.safeParse({ ...move, quantity: 0.0000001 });
assert.equal(invalidMove.success, false);
assert.equal(receiptLotAllocationsSchema.safeParse([{ purchaseItemId: "line", batches: [{ lotNumber: "batch", productionDate: null, expiryDate: null, quantity: 0.000001 }] }]).success, true);
const { enterpriseValidationErrorResponse } = load("lib/enterprise/common/http.ts");
for (const [locale, fragment] of [["fr", "six décimales"], ["en", "six decimal places"]]) {
  const response = enterpriseValidationErrorResponse(invalidMove.error, "VALIDATION_FAILED", new Request("http://localhost", { headers: { "accept-language": locale } }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.message.includes(fragment));
  assert.ok(!body.message.includes("INVENTORY_"), "Validation messages must remain human in both languages");
}
console.log("PASS #1228: unit precision 0–6, physical capacity, exact arithmetic, conversions, historical preservation and FEFO snapshots");
