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
let admin = true, siteIsolated = false, existing = true;
let status = "QUARANTINED", revision = 2, user = "reviewer";
let alerted = 0, readCalls = 0, auditCalls = 0, apiCalls = 0, stockWrites = 0;

const tx = {
  enterpriseStockLot: {
    findFirst: async ({ where, select }) => {
      ++readCalls;
      assert.equal(where.organizationId, "org-a");
      assert.equal(where.id, "lot-a");
      assert.equal(where.archivedAt, null);
      assert.equal(select.qualityChangedByUserId, true);
      return existing ? {
        id: "lot-a", revision, status, inventoryItemId: "item-a",
        lotNumber: "PRIVATE-BATCH", recallReference: "RECALL-ONE",
        qualityChangedByUserId: "recaller",
      } : null;
    },
  },
};
const prisma = {
  $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.RepeatableRead);
    return callback(tx);
  },
};
const mockModules = {
  "@prisma/client": { Prisma },
  "@/lib/enterprise/accounting/errors": { EnterpriseAccountingError: DomainError },
  "@/lib/enterprise/common/errors": {
    EnterpriseDomainError: DomainError, EnterpriseDomainConflictError: DomainConflict,
  },
  "@/lib/enterprise/common/http": {
    enterpriseDomainErrorResponse: error => ({ status: error.status || 500, body: { error: error.code } }),
    enterpriseValidationErrorResponse: () => ({ status: 400, body: { error: "INVALID" } }),
  },
  "@/lib/enterprise/crm-sales/helpers": {},
  "@/lib/enterprise/inventory/lot-allocation": {},
  "@/lib/enterprise/inventory/service": {},
  "@/lib/enterprise/inventory/custody-recovery-preflight": {},
  "@/lib/enterprise/inventory/custody-recovery-assessment": {},
  "@/lib/notifications": {},
  "@/lib/enterprise/inventory/recall-notifications": {
    recallWarehouseManagerRecipientsTx: async (_tx, org, item, lot, ref, initiatedBy) => {
      assert.equal(_tx, tx);
      assert.equal(org, "org-a"); assert.equal(item, "item-a");
      assert.equal(lot, "PRIVATE-BATCH"); assert.equal(ref, "RECALL-ONE");
      assert.equal(initiatedBy, "recaller");
      return ["manager-one"];
    },
    notifyRecallWarehouseManagers: async input => {
      ++alerted;
      assert.equal(input.organizationId, "org-a");
      assert.equal(input.recallReference, "RECALL-ONE");
      assert.equal(input.recipientUserIds.join(","), "manager-one");
      return { recipients: 1, queued: 1, failed: 0 };
    },
  },
  "next/server": { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) } },
  "@/lib/auth": { getSession: async () => ({ userId: user }) },
  "@/lib/audit": {
    writeAuditLog: async entry => {
      ++auditCalls;
      assert.equal(entry.organizationId, "org-a");
      assert.equal(entry.action, "ENTERPRISE_STOCK_LOT_RECALL_ALERTS_RETRIED");
      assert.equal(entry.metadata.queued, 1);
    },
    writeApiLog: async entry => {
      ++apiCalls;
      assert.equal(entry.organizationId, undefined); // organization is in metadata only
      assert.equal(entry.metadata.organizationId, "org-a");
      assert.equal(entry.metadata.domain, "inventory-recall-alerts-retry");
    },
  },
  "@/lib/enterprise/common/access": {
    getEnterpriseCommonDomainAccess: async ({ organizationId, moduleCode, action }) => {
      assert.equal(organizationId, "org-a");
      assert.equal(moduleCode, "INVENTORY_LOGISTICS");
      assert.equal(action, "write");
      return { canAdminister: admin };
    },
  },
  "@/lib/enterprise/retail/site-access": {
    retailInventoryVisibleSites: async org => {
      assert.equal(org, "org-a");
      return { isolationEnabled: siteIsolated };
    },
  },
  "@/lib/enterprise/retail/http": {},
  "@/lib/prisma": { prisma },
  "@/lib/rate-limit": { rateLimit: async () => ({ ok: true }) },
  "@/lib/request-security": { isSameOriginRequest: () => true },
};
const module = { exports: {} };
const source = fs.readFileSync("app/api/enterprise/[organizationId]/inventory/lots/route.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, {
  module, exports: module.exports,
  require: name => mockModules[name] || require(name),
  URL, Date,
}, { filename: "inventory-lots/route.ts" });
const { PATCH } = module.exports;
const params = { params: Promise.resolve({ organizationId: "org-a" }) };
const run = (value = {}) => PATCH({
  url: "https://example.test/api/enterprise/org-a/inventory/lots",
  json: async () => ({ action: "RETRY_RECALL_ALERTS", id: "lot-a", revision: 2, ...value }),
}, params);

let result = await run();
assert.equal(result.status, 200);
assert.equal(result.body.notifications.queued, 1);
assert.equal(alerted, 1); assert.equal(auditCalls, 1); assert.equal(apiCalls, 1);
assert.equal(stockWrites, 0, "Alert retry is read-only");
assert.equal(result.body.recipients, undefined, "Never return private recipient identities");

admin = false;
result = await run();
assert.equal(result.status, 403);
assert.equal(alerted, 1, "Unauthorized actor cannot enqueue notifications");
admin = true;
siteIsolated = true;
result = await run();
assert.equal(result.status, 403);
assert.equal(alerted, 1, "Site-restricted user cannot issue global recall alerts");
siteIsolated = false;
existing = false;
result = await run();
assert.equal(result.status, 409);
assert.equal(alerted, 1);
existing = true;
revision = 3;
result = await run();
assert.equal(result.status, 409, "Stale version rejected");
revision = 2;
status = "AVAILABLE";
result = await run();
assert.equal(result.status, 409, "Non-quarantined recall record rejected");
status = "QUARANTINED";
result = await run({ revision: 0 });
assert.equal(result.status, 400, "Invalid revision rejected by Zod");
result = await run({ arbitrary: "untrusted" });
assert.equal(result.status, 400, "Unknown fields rejected by Zod");
assert.equal(stockWrites, 0);
assert.equal(alerted, 1);
assert.equal(auditCalls, 1);
assert.equal(apiCalls, 1);
console.log("Recall alert retry HTTP handler: tenant, role, full-site visibility, stale revision, immutable lot, Zod, audit/API logs and neutral notification dispatch OK");
