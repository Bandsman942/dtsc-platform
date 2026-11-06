import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const { Prisma } = require("@prisma/client");
const source = fs.readFileSync("lib/enterprise/retail/inventory-policy.ts", "utf8");
class EnterpriseRetailError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const cjs = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(cjs, {
  module,
  exports: module.exports,
  require: (id) => id === "@/lib/enterprise/retail/errors" ? { EnterpriseRetailError } : require(id),
  Date, Intl, Set, Map,
}, { filename: "inventory-policy.ts" });

const {
  readRetailInventoryPolicy, businessDateKey, lotIsExpired, assertRetailLotPolicyTx,
} = module.exports;
const legacy = readRetailInventoryPolicy(null);
assert.deepEqual({ ...legacy }, { expiryMode: "ALLOW", enforceFefo: false, warningDays: 30, transferReception: "IMMEDIATE" });
const configured = readRetailInventoryPolicy({ unrelated: "keep", inventoryPolicy: { expiryMode: "BLOCK", enforceFefo: true, warningDays: 21 } });
assert.equal(configured.transferReception, "IMMEDIATE", "Saved policies from the earlier schema must still work");
assert.equal(readRetailInventoryPolicy({ inventoryPolicy: { ...configured, transferReception: "CONFIRMED" } }).transferReception, "CONFIRMED");
assert.throws(() => readRetailInventoryPolicy({ inventoryPolicy: { ...configured, warningDays: -1 } }), { code: "RETAIL_INVENTORY_POLICY_INVALID" });
assert.equal(businessDateKey(new Date("2026-11-06T23:30:00.000Z"), "Africa/Kinshasa"), "2026-11-07");
assert.equal(lotIsExpired(new Date("2026-11-06T00:00:00.000Z"), "2026-11-06"), false, "Expiry is a whole calendar date");
assert.equal(lotIsExpired(new Date("2026-11-05T00:00:00.000Z"), "2026-11-06"), true);

const yesterday = new Date(Date.now() - 86_400_000 * 2);
const upcoming = new Date(Date.now() + 86_400_000 * 5);
const later = new Date(Date.now() + 86_400_000 * 20);
const lots = [
  { id: "expired", inventoryItemId: "item", status: "AVAILABLE", expiryDate: yesterday },
  { id: "early", inventoryItemId: "item", status: "AVAILABLE", expiryDate: upcoming },
  { id: "late", inventoryItemId: "item", status: "AVAILABLE", expiryDate: later },
];
const balances = lots.map((lot) => ({ inventoryItemId: "item", stockLotId: lot.id, quantityOnHand: new Prisma.Decimal(5), quantityReserved: new Prisma.Decimal(0) }));
const tx = { enterpriseStockLot: { findMany: async () => lots }, enterpriseInventoryBalance: { findMany: async () => balances } };
const input = (policy, stockLotId) => ({
  organizationId: "org", warehouseId: "wh", timezone: "UTC", settings: { inventoryPolicy: policy },
  lines: [{ inventoryItemId: "item", stockLotId }],
});
const policy = { expiryMode: "BLOCK", enforceFefo: true, warningDays: 30, transferReception: "CONFIRMED" };
await assert.rejects(assertRetailLotPolicyTx(tx, input(policy, null)), { code: "RETAIL_STOCK_LOT_REQUIRED" });
await assert.rejects(assertRetailLotPolicyTx(tx, input(policy, "expired")), { code: "RETAIL_STOCK_LOT_EXPIRED" });
await assert.rejects(assertRetailLotPolicyTx(tx, input(policy, "late")), { code: "RETAIL_FEFO_LOT_REQUIRED" });
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input(policy, "early")));
await assert.doesNotReject(assertRetailLotPolicyTx(tx, input({ ...policy, expiryMode: "WARN", enforceFefo: false }, "expired")));

const inventory = fs.readFileSync("lib/enterprise/inventory/service.ts", "utf8");
const transferBlock = inventory.slice(inventory.indexOf("export async function decideEnterpriseStockTransfer"), inventory.indexOf("export async function receiveEnterpriseStockTransfer"));
assert.match(transferBlock, /confirmedReceipt \? "IN_TRANSIT" : "COMPLETED"/);
assert.match(transferBlock, /if \(!confirmedReceipt\) await receiveTransferLinesTx/);
assert.match(inventory, /stockLotId: destinationLotId/);
assert.match(inventory, /const sourceLot = await tx.enterpriseStockLot.findFirst/);
assert.match(inventory, /expiryDate: sourceLot.expiryDate/);
assert.match(inventory, /status: "IN_TRANSIT", revision/);
const migration = fs.readFileSync("prisma/migrations/20261106130000_retail_transfer_lots_per_warehouse/migration.sql", "utf8");
assert.match(migration, /"warehouseId", "lotNumber"/);
const receiveRoute = fs.readFileSync("app/api/enterprise/[organizationId]/stock-transfers/[transferId]/receive/route.ts", "utf8");
assert.match(receiveRoute, /isSameOriginRequest\(req\)/);
assert.match(receiveRoute, /getEnterpriseCommonDomainAccess/);
assert.match(receiveRoute, /writeAuditLog/);
const pos = fs.readFileSync("components/enterprise/professional/retail-pos-dtsc-workspace.tsx", "utf8");
assert.match(pos, /stockLotId: line.stockLotId/);
assert.match(pos, /retail\/stock-lots/);
assert.match(pos, /availableSiteAccounts/);
assert.match(fs.readFileSync("lib/enterprise/retail/service.ts", "utf8"), /RETAIL_FINANCIAL_ACCOUNT_SITE_MISMATCH/);
const expenseSchema = fs.readFileSync("prisma/enterprise-finance-reporting.prisma", "utf8");
assert.match(expenseSchema, /siteId\s+String\?/);
assert.match(expenseSchema, /site\s+EnterpriseSite\?/);
assert.match(fs.readFileSync("lib/enterprise/finance/expense-service.ts", "utf8"), /requireExpenseSite\(tx, organizationId, input.siteId\)/);
const ownerOverview = fs.readFileSync("app/api/enterprise/[organizationId]/retail/site-overview/route.ts", "utf8");
assert.match(ownerOverview, /role: \{ in: ADMIN_ROLES \}/);
assert.match(ownerOverview, /enterpriseExpense.groupBy/);
assert.match(fs.readFileSync("components/enterprise/professional/enterprise-inventory-operations-workspace.tsx", "utf8"), /retail|receiveTransfer/);
for (const lang of ["fr", "en"]) {
  const translations = JSON.parse(fs.readFileSync(`locales/retail-transaction-forms.${lang}.json`, "utf8")).inventoryPolicy;
  for (const key of ["title", "expiryMode", "fefo", "transferReception", "transferImmediate", "transferConfirmed", "transferHelp"]) {
    assert.ok(translations[key], `Missing ${lang} translation: ${key}`);
  }
}
console.log("HOTFIX #1042 tranche stock/lot/transfer: policy, expiry/FEFO, two-step receipt, audit and FR/EN contracts passed; OWNER_E2E pending.");
