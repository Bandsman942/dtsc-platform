import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const schema = read("prisma/enterprise-workflow-engine.prisma");
const migration = read("prisma/migrations/20261113104500_global_platform_outbox_scope/migration.sql");
const emailQueue = read("lib/mail/admin-broadcast-queue.ts");
const emailConstants = read("lib/mail/broadcast-constants.ts");
const pushQueue = read("lib/push/queue.ts");
const pushConstants = read("lib/push/constants.ts");
const sender = read("lib/push/sender.ts");
const pushWorker = read("lib/push/worker.ts");
const workflowEngine = read("lib/enterprise/workflows/engine.ts");
const projection = read("lib/enterprise/cross-module/projection-service.ts");
const bulk = read("lib/enterprise/bulk-jobs/worker.ts");

const domainEventModel = schema.slice(schema.indexOf("model EnterpriseDomainEvent {"));
assert.match(domainEventModel, /organizationId\s+String\?/, "Global outbox must model NULL platform scope");
assert.match(migration, /ALTER COLUMN "organizationId" DROP NOT NULL/, "Additive migration must allow NULL");
assert.match(migration, /EnterpriseDomainEvent_platform_scope_check/, "Platform NULL scope must be allow-listed");
for (const type of ["PLATFORM_WEB_PUSH_NOTIFICATION", "PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD", "PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY"])
  assert.ok(migration.includes(type), `Missing platform job type in scope guard: ${type}`);
assert.doesNotMatch(migration, /DROP (?:TABLE|CONSTRAINT)|DELETE FROM|TRUNCATE/i, "Do not drop any tenant FK, table or data");
assert.doesNotMatch(emailQueue + emailConstants + pushQueue + pushConstants, /__DTSC_PLATFORM__|ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID|WEB_PUSH_PLATFORM_ORGANIZATION_ID/,
  "Do not enqueue platform jobs with a synthetic foreign-key value");
assert.match(emailQueue, /organizationId: null/, "Platform email jobs must be unscoped");
assert.match(emailQueue, /prisma\.\$transaction/, "Broadcast email + notifications + push must remain atomic");
assert.match(pushConstants, /return organizationId \?\? null;/, "Global push scope must roundtrip as NULL");
assert.match(pushQueue, /organizationId: webPushQueueOrganizationId\(organizationId\)/);
assert.match(sender, /expectedQueueOrganizationId: string \| null/, "Push scope verifier must accept nullable scope");
assert.match(sender, /webPushQueueOrganizationId\(notification\.organizationId\) !== expectedQueueOrganizationId/, "Push must verify canonical notification scope");
assert.match(pushWorker, /organizationId: string \| null/, "Push worker claim must represent platform scope");
assert.match(workflowEngine, /if \(!event\.organizationId\) return \[\];/, "Tenant workflows must ignore global platform events");
assert.match(projection, /if \(!event\?\.organizationId\)/, "Tenant projections must reject global platform events");
assert.match(bulk, /if \(!event\.organizationId\) continue;/, "Tenant bulk cleanup must not touch global jobs");
console.log("PASS global outbox static contract: guarded NULL platform scope, tenant isolation, original worker invariants");
