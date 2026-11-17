import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const params = { params: Promise.resolve({ organizationId: "org-a" }) };
const item = { id: "tracked-1", revision: 1, lotTracking: false, expiryTracking: false };
let access = { canWrite: true, canAdminister: true, canManage: true };
let isolated = false, warehouseAllowed = true, foundWarehouse = true, unmapped = false, undated = false, limited = false;
let selectedQuery, updated = 0, transactionOptions;
const db = {
  enterpriseWarehouse: { findFirst: async ({ where }) => { assert.equal(where.organizationId, "org-a"); return foundWarehouse ? { id: "wh-a" } : null; } },
  enterpriseInventoryItem: {
    findMany: async (args) => { selectedQuery = args; return [{ id: "tracked-1", expiryTracking: true, catalogItem: { name: "Milk", code: "M001" } }]; },
    count: async () => 26,
    findFirst: async () => item,
    updateMany: async () => { updated++; return { count: 1 }; },
  },
  enterpriseInventoryBalance: { findFirst: async ({ where }) => { assert.equal(where.stockLotId, null); return unmapped ? { id: "unmapped" } : null; } },
  enterpriseStockLot: { findFirst: async () => undated ? { id: "undated" } : null, count: async () => 0 },
  $transaction: async (fn, options) => { transactionOptions = options; return fn(db); },
};
const mocks = {
  "next/server": { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) } },
  "@/lib/auth": { getSession: async () => ({ userId: "actor" }) },
  "@/lib/audit": { writeApiLog: async () => {}, writeAuditLog: async () => {} },
  "@/lib/enterprise/common/access": { getEnterpriseCommonDomainAccess: async () => access },
  "@/lib/enterprise/retail/http": { retailErrorResponse: () => ({ status: 403 }) },
  "@/lib/enterprise/retail/site-access": {
    retailInventoryVisibleSites: async () => ({ isolationEnabled: isolated, siteIds: ["site-a"], manageableSiteIds: ["site-a"] }),
    requireRetailWarehouseCapability: async (org, actor, wh, capability) => {
      assert.equal(org, "org-a"); assert.equal(actor, "actor"); assert.equal(capability, "MANAGE_STOCK");
      if (!warehouseAllowed || wh !== "wh-a") throw Error("denied");
    },
  },
  "@/lib/request-security": { isSameOriginRequest: () => true },
  "@/lib/rate-limit": { rateLimit: async () => ({ ok: !limited }) },
  "@/lib/prisma": { prisma: db },
  "@/lib/enterprise/common/http": { enterpriseValidationErrorResponse: () => ({ status: 400 }) },
};
function load(path) {
  const mod = { exports: {} };
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: (id) => mocks[id] || require(id), URL, Date }, { filename: path });
  return mod.exports;
}
const { GET } = load("app/api/enterprise/[organizationId]/inventory/route.ts");
const { PUT } = load("app/api/enterprise/[organizationId]/inventory/item-policy/route.ts");
const get = (extra = "") => GET({ url: "https://example.test/api?view=lot-options&warehouseId=wh-a&page=2&search=milk" + extra }, params);
isolated = true;
const eligible = await get();
assert.equal(eligible.status, 200);
assert.equal(eligible.body.pagination.pageCount, 2);
assert.equal(selectedQuery.skip, 25);
assert.equal(selectedQuery.where.organizationId, "org-a");
assert.equal(selectedQuery.where.lotTracking, true);
assert.equal(selectedQuery.where.catalogItem.trackInventory, true);
assert.equal(selectedQuery.where.catalogItem.organizationId, "org-a");
assert.equal(selectedQuery.where.balances, undefined, "The first batch must not require an existing balance");
assert.equal(selectedQuery.select.balances, undefined, "Never disclose another site balance");
assert.equal(selectedQuery.where.catalogItem.OR[2].sku.contains, "milk");
warehouseAllowed = false;
assert.equal((await get()).status, 403);
warehouseAllowed = true;
foundWarehouse = false;
assert.equal((await get()).status, 404);
foundWarehouse = true;
access = { ...access, canWrite: false };
assert.equal((await get()).status, 403);
access = { ...access, canWrite: true };
const put = (extra = {}) => PUT({ json: async () => ({ inventoryItemId: item.id, revision: 1, minimumQuantity: null, reorderQuantity: null, lotTracking: true, expiryTracking: true, ...extra }) }, params);
assert.equal((await put()).status, 403, "Scoped staff cannot change policies affecting every warehouse");
isolated = false;
access = { ...access, canAdminister: false };
assert.equal((await put()).status, 403);
access = { ...access, canAdminister: true };
limited = true;
assert.equal((await put()).status, 429);
limited = false;
unmapped = true;
const blocked = await put();
assert.equal(blocked.status, 409);
assert.equal(blocked.body.error, "INVENTORY_POLICY_UNMAPPED_STOCK");
assert.equal(updated, 0);
unmapped = false;
undated = true;
assert.equal((await put()).body.error, "INVENTORY_POLICY_UNDATED_LOTS");
assert.equal(updated, 0);
undated = false;
assert.equal((await put({ revision: 2 })).status, 409);
assert.equal(updated, 0);
assert.equal((await put()).status, 200);
assert.equal(updated, 1);
assert.equal(transactionOptions.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
console.log("Inventory lot options and activation guards OK");
