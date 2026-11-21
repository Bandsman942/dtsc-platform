import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const notifications = [];
const acceptedKeys = new Set();

const mocks = {
  "@/lib/notifications": {
    notifyUser: async entry => {
      assert.equal(entry.organizationId, "org-a");
      assert.equal(entry.type, "INFO");
      assert.equal(entry.targetUrl, "/enterprise-modules/INVENTORY_LOGISTICS");
      assert.ok(!entry.title.includes("BATCH-PRIVATE"));
      assert.ok(!entry.body.includes("BATCH-PRIVATE"));
      assert.ok(!entry.body.includes("warehouse-secret"));
      if (entry.userId === "manager-failing") throw new Error("notification unavailable");
      notifications.push(entry);
      acceptedKeys.add(entry.idempotencyKey);
      return { id: entry.idempotencyKey };
    },
  },
};
function load(path) {
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, {
    module: mod, exports: mod.exports,
    require: name => mocks[name] || require(name),
  }, { filename: path });
  return mod.exports;
}
const { recallWarehouseManagerRecipientsTx, notifyRecallWarehouseManagers } =
  load("lib/enterprise/inventory/recall-notifications.ts");

let queries = 0;
const tx = {
  enterpriseStockLot: {
    findMany: async ({ where, select, distinct }) => {
      ++queries;
      assert.equal(where.organizationId, "org-a");
      assert.equal(where.inventoryItemId, "item-a");
      assert.equal(where.lotNumber, "BATCH-PRIVATE");
      assert.equal(where.recallReference, "RECALL-TEST");
      assert.equal(where.archivedAt, null);
      assert.equal(select.warehouseId, true);
      assert.equal(distinct.join(","), "warehouseId");
      return [{ warehouseId: "warehouse-a" }, { warehouseId: "warehouse-b" },
        { warehouseId: "warehouse-c" }, { warehouseId: "warehouse-d" }];
    },
  },
  enterpriseWarehouse: {
    findMany: async ({ where, select }) => {
      assert.equal(where.organizationId, "org-a");
      assert.equal(where.status, "ACTIVE");
      assert.equal(where.archivedAt, null);
      assert.equal(where.managerUserId.not, null);
      assert.equal(where.id.in.length, 4);
      assert.equal(select.managerUserId, true);
      return [{ managerUserId: "manager-one" }, { managerUserId: "manager-one" },
        { managerUserId: "manager-failing" }, { managerUserId: "requester" },
        { managerUserId: "manager-removed" }];
    },
  },
  organizationMember: {
    findMany: async ({ where, select }) => {
      assert.equal(where.organizationId, "org-a");
      assert.equal(where.status, "ACTIVE");
      assert.equal(where.removedAt, null);
      assert.equal(where.userId.in.includes("requester"), false);
      assert.equal(select.userId, true);
      // The removed manager MUST NOT receive the recall alert.
      return [{ userId: "manager-one" }, { userId: "manager-failing" }];
    },
  },
};
const recipients = await recallWarehouseManagerRecipientsTx(
  tx, "org-a", "item-a", "BATCH-PRIVATE", "RECALL-TEST", "requester");
assert.equal(recipients.join(","), "manager-failing,manager-one");
assert.equal(queries, 1);

const sent = await notifyRecallWarehouseManagers({
  organizationId: "org-a", recallReference: "RECALL-TEST", recipientUserIds: recipients,
});
assert.equal(sent.recipients, 2);
assert.equal(sent.queued, 1);
assert.equal(sent.failed, 1);
assert.equal(notifications.length, 1);
assert.ok(notifications[0].idempotencyKey.includes("RECALL-TEST:manager-one"));
assert.ok(!notifications[0].title.includes("BATCH-PRIVATE"));

const again = await notifyRecallWarehouseManagers({
  organizationId: "org-a", recallReference: "RECALL-TEST", recipientUserIds: ["manager-one"],
});
assert.equal(again.queued, 1);
assert.equal(notifications[1].idempotencyKey, notifications[0].idempotencyKey,
  "Retries must use the same DB-enforced idempotency key");

const noManagers = await recallWarehouseManagerRecipientsTx(
  { ...tx, enterpriseStockLot: { findMany: async () => [] } },
  "org-a", "item-a", "BATCH-PRIVATE", "RECALL-TEST", "requester");
assert.equal(noManagers.length, 0);

const route = fs.readFileSync("app/api/enterprise/[organizationId]/inventory/lots/route.ts", "utf8");
assert.ok(route.includes("recallWarehouseManagerRecipientsTx("));
assert.ok(route.includes("notifyRecallWarehouseManagers("));
assert.ok(route.includes('domain:"inventory-recall-alerts-retry"'),"Recall retry must emit an ApiLog");
assert.ok(route.includes('domain:input.recall?"inventory-lot-recall":"inventory-lot-quality"'),"Recall action must emit an ApiLog");
for (const retryGuard of [
  'action:z.literal("RETRY_RECALL_ALERTS")',
  'if(!access.canAdminister)',
  'if(visibility.isolationEnabled)',
  'lot.status!=="QUARANTINED"',
  'lot.revision!==parsed.data.revision',
  'Prisma.TransactionIsolationLevel.RepeatableRead',
  'ENTERPRISE_STOCK_LOT_RECALL_ALERTS_RETRIED',
]) {
  assert.ok(route.includes(retryGuard), `Alert retry must retain server guard ${retryGuard}`);
}
const governanceUi=fs.readFileSync("components/enterprise/professional/inventory-stock-governance.tsx","utf8");
for (const uiGuard of ['retryRecallAlerts(lot)', 'lot.recallReference&&canRecall',
  'action:"RETRY_RECALL_ALERTS"', 'alerts.failed']) {
  assert.ok(governanceUi.includes(uiGuard), `Recall alert retry UI must contain ${uiGuard}`);
}
const deliveryIndex = route.indexOf("const alerts=");
assert.ok(deliveryIndex > route.indexOf('return {revision:lot.revision+1,recallReference:reference'),
  "Notifications must never be sent inside the recall mutation branch");
assert.ok(route.includes("...publicResult") && route.includes("recallRecipients:internalRecipients"),
  "Recipient identifiers must not be present in public recall responses");
assert.ok(acceptedKeys.size > 0);
console.log("Supplier/retail stock recall alerts: active organization-scoped managers, neutral payloads, idempotent delivery, no identity leaks, partial failure isolation");
