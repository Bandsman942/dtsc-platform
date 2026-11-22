import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const gatePath = "lib/enterprise/inventory/stock-recall-gate.ts";
class EnterpriseDomainError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const module = { exports: {} };
const js = ts.transpileModule(fs.readFileSync(gatePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, {
  module, exports: module.exports,
  require: id => id === "@/lib/enterprise/common/errors" ? { EnterpriseDomainError } : require(id),
}, { filename: gatePath });
const { assertNoRecalledLotConsumptionTx } = module.exports;
let recalled = false;
const lookups = [];
const tx = {
  enterpriseStockLot: {
    findFirst: async ({ where, select }) => {
      lookups.push({ where, select });
      assert.equal(where.organizationId, "org-a", "Prevent cross-tenant recall reads");
      assert.equal(where.inventoryItemId, "item-a", "Prevent another SKU's recall from blocking this item");
      assert.equal(where.lotNumber, "BATCH-A", "Match physical batch, not warehouse-local ID");
      assert.equal(where.recallReference.not, null);
      assert.equal(select.id, true);
      assert.equal("warehouseId" in where, false, "A recall must span warehouses");
      return recalled ? { id: "recalled-sister-in-other-warehouse" } : null;
    },
  },
};
const input = movementType => ({
  organizationId: "org-a", inventoryItemId: "item-a",
  stockLot: { lotNumber: "BATCH-A", recallReference: null },
  movementType,
});
for (const movementType of ["SALE_FULFILLMENT", "PRODUCTION_CONSUMPTION", "TRANSFER_OUT"]) {
  recalled = false;
  await assert.doesNotReject(assertNoRecalledLotConsumptionTx(tx, input(movementType)));
  recalled = true;
  await assert.rejects(assertNoRecalledLotConsumptionTx(tx, input(movementType)), {
    code: "STOCK_LOT_RECALLED", status: 409,
  });
}
const beforeNoRead = lookups.length;
await assert.rejects(assertNoRecalledLotConsumptionTx(tx, {
  ...input("SALE_FULFILLMENT"),
  stockLot: { lotNumber: "BATCH-A", recallReference: "RECALL-LOCAL" },
}), { code: "STOCK_LOT_RECALLED", status: 409 });
assert.equal(lookups.length, beforeNoRead, "Locally recalled batch needs no second DB lookup");
for (const movementType of ["LOT_WRITE_OFF", "SUPPLIER_RETURN_OUT", "CUSTODY_RECOVERY_IN", "TRANSFER_IN", "RETURN_IN", "COUNT_CORRECTION", "OPENING_BALANCE"]) {
  await assert.doesNotReject(assertNoRecalledLotConsumptionTx(tx, input(movementType)));
}
await assert.doesNotReject(assertNoRecalledLotConsumptionTx(tx, { ...input("SALE_FULFILLMENT"), stockLot: null }));
assert.equal(lookups.length, beforeNoRead, "Disposal, returns, recovery and untracked paths are not consumption guards");
const service = fs.readFileSync("lib/enterprise/inventory/service.ts", "utf8");
assert.match(service, /import \{ assertNoRecalledLotConsumptionTx \} from "@\/lib\/enterprise\/inventory\/stock-recall-gate"/);
assert.match(service, /await assertNoRecalledLotConsumptionTx\(tx, \{/);
const guardIndex = service.indexOf("await assertNoRecalledLotConsumptionTx(tx, {");
const balanceIndex = service.indexOf("const balance = await tx.enterpriseInventoryBalance.findFirst", guardIndex);
assert.ok(guardIndex >= 0 && balanceIndex > guardIndex, "Core guard must run before inventory movement writes");
assert.match(service, /lotNumber: true, recallReference: true/);
console.log("#1215 core stock recall safeguard: cross-warehouse same-SKU recall, sale/production/transfer, no unrelated disposal or returns, transactional placement passed.");
