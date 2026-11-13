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

const domainEventModel = schema.slice(schema.indexOf("model EnterpriseDomainEvent {"));
assert.match(domainEventModel, /organizationId\s+String\b(?!\?)/, "Outbox owner remains required by Prisma compound unique / tenant relations");
assert.match(domainEventModel, /@@unique\(\[organizationId, id\]\)/, "Keep composite tenant-safe relation unique");
assert.match(migration, /EnterpriseDomainEvent_global_broadcast_owner_check/, "Migration must enforce global broadcast ownership");
assert.match(migration, /"organizationId" = 'dtsc-internal'/, "Global email payload/delivery must belong to real internal organization");
assert.doesNotMatch(migration, /DROP (?:TABLE|CONSTRAINT|NOT NULL)|DELETE FROM|TRUNCATE/i, "Do not weaken the tenant FK, composite constraint or delete rows");
for (const type of ["PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD", "PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY"])
  assert.ok(migration.includes(type), `Missing guarded mail type: ${type}`);
assert.doesNotMatch(emailQueue + emailConstants + pushQueue + pushConstants, /__DTSC_PLATFORM__/, "Synthetic FK sentinel must be eliminated");
assert.match(emailConstants, /ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID = DTSC_INTERNAL_ORGANIZATION_ID/, "Email uses canonical owner ID");
assert.match(emailQueue, /organizationId: ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID/, "Email must have real organization ID");
assert.match(emailQueue, /prisma\.\$transaction/, "Notifications, Push and mail jobs remain atomic");
assert.match(emailQueue, /userId: recipient\.id,\s+organizationId: null,/, "Global user notifications retain null organizationId");
assert.match(pushConstants, /return organizationId \?\? DTSC_INTERNAL_ORGANIZATION_ID;/, "Global Push must map to real internal owner");
assert.match(pushQueue, /organizationId: webPushQueueOrganizationId\(organizationId\)/, "Push enqueues canonical scope");
assert.match(sender, /expectedQueueOrganizationId: string;/, "Push verifier continues to require a real tenant");
assert.match(sender, /webPushQueueOrganizationId\(notification\.organizationId\) !== expectedQueueOrganizationId/, "Push sender checks notification scope");
assert.match(pushWorker, /organizationId: string;/, "Push claim remains non-nullable");
console.log("PASS global outbox static contract: real DTSC owner, FK/Prisma compatibility, worker isolation and mail atomicity");
