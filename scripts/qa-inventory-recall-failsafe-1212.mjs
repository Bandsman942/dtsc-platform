import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");

class DomainError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
class DomainConflict extends DomainError {
  constructor(code = "INVENTORY_LOT_CONFLICT") { super(code, 409); }
}

let quarantined = false, committed = false, calls = 0, notifications = 0;
let audited = false, apiLogged = false;
const lot = {
  id: "lot-a", organizationId: "org-a", warehouseId: "warehouse-a",
  inventoryItemId: "item-a", lotNumber: "PRIV-BATCH", status: "AVAILABLE",
  recallReference: null, revision: 2, archivedAt: null,
  expiryDate: null, productionDate: null,
  inventoryItem: { expiryTracking: false, catalogItemId: "catalog-a" },
};
const tx = {
  enterpriseStockLot: {
    findFirst: async ({ where }) => {
      assert.equal(where.organizationId, "org-a");
      if (where.recallReference?.not) return null; // no prior recall
      return lot;
    },
    updateMany: async ({ where, data }) => {
      ++calls;
      assert.equal(where.organizationId, "org-a");
      assert.equal(where.lotNumber, "PRIV-BATCH");
      assert.equal(data.status, "QUARANTINED");
      assert.ok(data.recallReference.startsWith("RECALL-"));
      lot.status = data.status;
      lot.recallReference = data.recallReference;
      lot.revision += 1;
      return { count: 1 };
    },
  },
  pharmacyProductExtension: { count: async () => 0 },
  enterpriseSectorInventoryEvent: { count: async () => 0 },
};
const prisma = {
  $transaction: async (callback, options) => {
    if (options.isolationLevel === Prisma.TransactionIsolationLevel.RepeatableRead) {
      assert.equal(committed, true, "Notification lookup can only run after stock commit");
      throw new Error("recipient lookup is temporarily offline");
    }
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    const result = await callback(tx);
    committed = true;
    return result;
  },
};
const mocks = {
  "@prisma/client": { Prisma },
  "@/lib/enterprise/accounting/errors": { EnterpriseAccountingError: DomainError },
  "@/lib/enterprise/common/errors": {
    EnterpriseDomainError: DomainError, EnterpriseDomainConflictError: DomainConflict,
  },
  "@/lib/enterprise/common/http": {
    enterpriseDomainErrorResponse: error => ({ status: error.status || 500, body: { error: error.code } }),
    enterpriseValidationErrorResponse: () => ({ status: 400, body: { error: "INVALID" } }),
  },
  "@/lib/enterprise/crm-sales/helpers": {
    publishEnterpriseEvent: async (_tx, entry) => {
      assert.equal(committed, false);
      assert.equal(entry.eventType, "STOCK_LOT_RECALLED");
    },
  },
  "@/lib/enterprise/inventory/lot-allocation": {},
  "@/lib/enterprise/inventory/service": {
    requireInventoryStockAuthorityTx: async (_tx, org, actor, warehouse) => {
      assert.equal(org, "org-a");
      assert.equal(actor, "actor");
      assert.equal(warehouse, "warehouse-a");
    },
  },
  "@/lib/enterprise/inventory/custody-recovery-preflight": {},
  "@/lib/enterprise/inventory/custody-recovery-assessment": {},
  "@/lib/notifications": {},
  "@/lib/enterprise/inventory/recall-notifications": {
    recallWarehouseManagerRecipientsTx: async () => {
      throw Error("Should not be called when recipient lookup transaction failed");
    },
    notifyRecallWarehouseManagers: async () => {
      ++notifications;
      throw Error("Must never enqueue without verified recipients");
    },
  },
  "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  "@/lib/auth": { getSession: async () => ({ userId: "actor" }) },
  "@/lib/audit": {
    writeAuditLog: async record => {
      assert.equal(committed, true);
      assert.equal(record.action, "ENTERPRISE_STOCK_LOT_RECALLED");
      assert.equal(record.metadata.notificationDiscoveryFailed, true);
      audited = true;
    },
    writeApiLog: async record => {
      assert.equal(record.metadata.domain, "inventory-lot-recall");
      assert.equal(record.metadata.notificationDiscoveryFailed, true);
      apiLogged = true;
    },
  },
  "@/lib/enterprise/common/access": {
    getEnterpriseCommonDomainAccess: async ({ organizationId, moduleCode, action }) => {
      assert.equal(organizationId, "org-a");
      assert.equal(moduleCode, "INVENTORY_LOGISTICS");
      assert.equal(action, "write");
      return { canAdminister: true, canManage: true };
    },
  },
  "@/lib/enterprise/retail/site-access": {
    retailInventoryVisibleSites: async () => ({ isolationEnabled: false }),
  },
  "@/lib/enterprise/retail/http": {},
  "@/lib/prisma": { prisma },
  "@/lib/rate-limit": { rateLimit: async () => ({ ok: true }) },
  "@/lib/request-security": { isSameOriginRequest: () => true },
};
const source = fs.readFileSync("app/api/enterprise/[organizationId]/inventory/lots/route.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, {
  module: mod, exports: mod.exports,
  require: name => mocks[name] || require(name), URL, Date,
}, { filename: "inventory-lots/route.ts" });
const result = await mod.exports.PATCH({
  url: "https://example.test/api/enterprise/org-a/inventory/lots",
  json: async () => ({
    id: "lot-a", revision: 2, recall: true,
    qualityReason: "Unsafe batch with confirmed quality issue",
  }),
}, { params: Promise.resolve({ organizationId: "org-a" }) });
assert.equal(result.status, 200, "A failed recipient lookup cannot turn a successful recall into a 500");
assert.equal(result.body.status, "QUARANTINED");
assert.equal(result.body.affectedLots, 1);
assert.equal(result.body.notifications.discoveryFailed, true);
assert.equal(result.body.notifications.queued, 0);
assert.equal(result.body.notifications.failed, 0);
assert.equal(committed, true);
assert.equal(quarantined || lot.status === "QUARANTINED", true);
assert.ok(lot.recallReference.startsWith("RECALL-"));
assert.equal(calls, 1);
assert.equal(notifications, 0);
assert.equal(audited && apiLogged, true);
assert.equal(result.body.recipients, undefined);
console.log("Lot recall safe commit: real HTTP PATCH keeps quarantine when recipient lookup fails after commit, with audited and user-visible retry hint");
