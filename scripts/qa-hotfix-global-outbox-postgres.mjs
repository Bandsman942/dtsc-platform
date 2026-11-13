import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// Runs ONLY against the isolated local PostgreSQL service supplied by Quality.
// Never enqueue a message, notification, or provider request in production.
const db = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(db.hostname) && /test/i.test(db.pathname),
  "Global outbox integration requires a local PostgreSQL *test* database");
const prisma = new PrismaClient();
const load = workflowTestLoader({ "@/lib/prisma": { prisma } });
const { enqueueAdminBroadcast } = load("@/lib/mail/admin-broadcast-queue");
const { webPushQueueOrganizationId } = load("@/lib/push/constants");
const prefix = `global-outbox-${randomUUID()}`;
const users = Array.from({ length: 3 }, (_, i) => ({
  id: `${prefix}-user-${i}`,
  email: `global-outbox-${randomUUID()}@example.test`,
  name: `QA Recipient ${i}`,
  passwordHash: "qa-only-no-login",
  notifyBroadcastEnabled: i !== 2,
}));
const organizationId = `${prefix}-tenant`;
const broadcasts = [];
const createdEvents = [];
try {
  assert.equal(webPushQueueOrganizationId(null), null);
  assert.equal(webPushQueueOrganizationId(undefined), null);
  assert.equal(webPushQueueOrganizationId(organizationId), organizationId);

  await prisma.user.createMany({ data: users });
  await prisma.organization.create({ data: { id: organizationId, name: "QA Outbox tenant" } });
  const recipients = users.map(({ id, email, name, notifyBroadcastEnabled }) => ({ id, email, name, notifyBroadcastEnabled }));

  // Non-personalized email: one durable group delivery + one master payload.
  const grouped = await enqueueAdminBroadcast({
    recipients, title: `QA global ${prefix}`, body: "Global test message",
    type: "BROADCAST",
  });
  broadcasts.push(grouped.broadcastId);
  assert.equal(grouped.recipients, 3);
  assert.equal(grouped.notificationsQueued, 2);
  assert.equal(grouped.pushJobsQueued, 2);
  assert.equal(grouped.emailJobsQueued, 1);
  assert.equal(grouped.personalized, false);

  // Personalized email: one delivery per user, master payload stored once.
  const personalized = await enqueueAdminBroadcast({
    recipients, title: `QA personalized ${prefix}`,
    body: "Bonjour {user}, global test message", type: "BROADCAST",
  });
  broadcasts.push(personalized.broadcastId);
  assert.equal(personalized.emailJobsQueued, 3);
  assert.equal(personalized.notificationsQueued, 2);
  assert.equal(personalized.personalized, true);

  const notifications = await prisma.notification.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    select: { id: true, organizationId: true, userId: true },
  });
  assert.equal(notifications.length, 4);
  assert.ok(notifications.every((item) => item.organizationId === null));

  const push = await prisma.enterpriseDomainEvent.findMany({
    where: { eventType: "PLATFORM_WEB_PUSH_NOTIFICATION", entityId: { in: notifications.map((item) => item.id) } },
  });
  assert.equal(push.length, 4);
  assert.ok(push.every((item) => item.organizationId === null && item.processingStatus === "PENDING"));
  for (const broadcastId of broadcasts) {
    const jobs = await prisma.enterpriseDomainEvent.findMany({ where: {
      entityId: { startsWith: broadcastId },
      eventType: { in: ["PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD", "PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY"] },
    } });
    const expected = broadcastId === grouped.broadcastId ? 2 : 4;
    assert.equal(jobs.length, expected);
    assert.ok(jobs.every((job) => job.organizationId === null));
    assert.equal(jobs.filter((job) => job.eventType === "PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD").length, 1);
    assert.equal(jobs.filter((job) => job.eventType === "PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY").length, expected - 1);
  }

  // A tenant job still needs a REAL organization (FK enforced).
  const valid = await prisma.enterpriseDomainEvent.create({ data: {
    organizationId, eventType: "QA_ENTERPRISE_ONLY", entityType: "QA",
    entityId: prefix, idempotencyKey: `${prefix}-tenant-event`,
  } });
  createdEvents.push(valid.id);
  assert.equal(valid.organizationId, organizationId);
  await assert.rejects(prisma.enterpriseDomainEvent.create({ data: {
    organizationId: `${prefix}-missing-tenant`, eventType: "QA_ENTERPRISE_ONLY",
    entityType: "QA", entityId: prefix, idempotencyKey: `${prefix}-bad-fk`,
  } }), (error) => error.code === "P2003");

  // A NULL tenant context is allowed ONLY for the three platform event types.
  await assert.rejects(prisma.enterpriseDomainEvent.create({ data: {
    organizationId: null, eventType: "QA_ENTERPRISE_ONLY",
    entityType: "QA", entityId: prefix, idempotencyKey: `${prefix}-bad-global`,
  } }), "Global scope allow-list constraint must reject tenant event types");

  console.log("PASS HOTFIX global outbox PostgreSQL: group/personalized delivery, push, NULL scope, tenant FK, allow-list, idempotent keys");
} finally {
  const notifications = await prisma.notification.findMany({
    where: { userId: { in: users.map((user) => user.id) } }, select: { id: true },
  }).catch(() => []);
  await prisma.enterpriseDomainEvent.deleteMany({ where: { OR: [
    { id: { in: createdEvents } },
    { entityId: { in: notifications.map((item) => item.id) } },
    ...broadcasts.map((id) => ({ entityId: { startsWith: id } })),
  ] } }).catch(() => undefined);
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
}
