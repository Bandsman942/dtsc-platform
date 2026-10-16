import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// Integration assertions mutate records: never point this script at production.
const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(database.hostname) && /test/.test(database.pathname),
  "WF-06S2A requires a dedicated local test PostgreSQL DB");
const prisma = new PrismaClient();
const prefix = `wf844-${randomUUID()}`;
const organizationId = `${prefix}-tenant`, otherTenant = `${prefix}-other`, actor = `${prefix}-actor`;
const loader = workflowTestLoader({ "@/lib/prisma": { prisma } });
const { createDisabledWorkflowSchedule: create, disabledWorkflowScheduleCreateSchema: schema } =
  loader("@/lib/enterprise/workflows/schedule-authoring");
const schedules = [], definitions = [], versions = [];
const makeDefinition = async (tenant, suffix, source = "EnterpriseTask") => {
  const definition = await prisma.enterpriseWorkflowDefinition.create({
    data: { organizationId: tenant, code: `WF844_${suffix}`, name: "Inert schedule authoring QA",
      status: "ACTIVE", triggerType: "MANUAL", triggerEntityType: source, createdByUserId: actor },
  });
  const version = await prisma.enterpriseWorkflowVersion.create({
    data: { organizationId: tenant, definitionId: definition.id, versionNumber: 1,
      status: "PUBLISHED", createdByUserId: actor, publishedAt: new Date("2026-10-16T16:00:00Z") },
  });
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: definition.id }, data: { currentVersionId: version.id },
  });
  definitions.push(definition.id);
  versions.push(version.id);
  return { definition, version };
};
const schedule = { frequency: "DAILY", timeZone: "America/New_York", hour: 1, minute: 30 };
const date = new Date("2026-10-31T20:00:00Z");
try {
  for (const id of [organizationId, otherTenant]) {
    await prisma.organization.create({
      data: { id, name: "WF-06S2A fixture", organizationType: "CLIENT", status: "ACTIVE" },
    });
  }
  await prisma.user.create({ data: { id: actor, email: `${actor}@example.test`,
    name: "Disabled scheduler QA", passwordHash: "disabled-test-fixture" } });
  await prisma.organizationMember.create({ data: {
    organizationId, userId: actor, role: "OWNER", status: "ACTIVE",
  } });
  const own = await makeDefinition(organizationId, "A");
  const external = await makeDefinition(otherTenant, "B");
  const sourceless = await makeDefinition(organizationId, "C", null);
  const base = { workflowDefinitionId: own.definition.id, workflowVersionId: own.version.id, schedule };

  assert.equal(schema.safeParse({ ...base, status: "ENABLED" }).success, false,
    "Caller cannot supply an executable status");
  assert.equal(schema.safeParse({ ...base, schedule: { ...schedule, timeZone: "Invalid/Zone" } }).success, false);
  assert.equal(schema.safeParse({ ...base, schedule: { ...schedule, frequency: "WEEKLY" } }).success, false);
  assert.equal(schema.safeParse({ ...base, schedule: { ...schedule, dayOfWeek: 3 } }).success, false);

  const beforeRuns = await prisma.enterpriseWorkflowRun.count({ where: { organizationId } });
  const created = await create({ organizationId, actorUserId: actor, payload: base, asOf: date });
  schedules.push(created.id);
  assert.equal(created.status, "DISABLED");
  assert.equal(created.nextRunAt.toISOString(), "2026-11-01T05:30:00.000Z",
    "Fall-back always uses the first 01:30 local instant");
  assert.equal(created.workflowVersionId, own.version.id);
  const persisted = await prisma.enterpriseWorkflowSchedule.findFirstOrThrow({
    where: { id: created.id, organizationId },
  });
  assert.equal(persisted.createdByUserId, actor);
  assert.equal(persisted.status, "DISABLED");

  const second = await create({
    organizationId, actorUserId: actor, payload: base,
    asOf: new Date("2026-11-01T05:31:00Z"),
  });
  schedules.push(second.id);
  assert.equal(second.nextRunAt.toISOString(), "2026-11-02T06:30:00.000Z",
    "Second DST fold must never create a second same-day schedule");
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId } }), beforeRuns);
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { scheduleId: { in: schedules } } }), 0,
    "Authoring does not reserve receipts or dispatch runs");

  // Exercise the ACTUAL Next route functions with real PostgreSQL persistence.
  // External auth/entitlement/same-origin boundaries are controlled, not silently
  // bypassed: this proves route behavior for each outcome, not a browser E2E.
  let routeSession = { userId: actor, activeContext: "ORGANIZATION", activeOrganizationId: organizationId };
  let workflowRights = { canRead: true, canCreateDraft: true };
  let sourceAllowed = true, sameOrigin = true, limitAllowed = true;
  const auditCalls = [];
  const routeLoader = workflowTestLoader({
    "@/lib/prisma": { prisma },
    "next/server": {
      NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body }) },
    },
    "@/lib/auth": { getSession: async () => routeSession },
    "@/lib/audit": {
      writeApiLog: async () => {},
      writeAuditLog: async (entry) => { auditCalls.push(entry); },
    },
    "@/lib/enterprise/workflows/access": {
      getEnterpriseWorkflowAccess: async (session, tenant) =>
        session.activeContext === "ORGANIZATION" && session.activeOrganizationId === tenant
          ? workflowRights : null,
    },
    "@/lib/enterprise/workflows/source-access": {
      listReadableWorkflowEntityTypes: async () => sourceAllowed ? ["EnterpriseTask"] : [],
      requireWorkflowSourceAccess: async ({ userId, organizationId: tenant, sourceEntityType }) => {
        if (userId !== actor || tenant !== organizationId || sourceEntityType !== "EnterpriseTask" || !sourceAllowed) {
          throw new (routeLoader("@/lib/enterprise/workflows/errors").EnterpriseWorkflowError)(
            "Source métier non autorisée.", 403, "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED", "SECURITY");
        }
      },
    },
    "@/lib/rate-limit": {
      getRateLimitKey: () => "wf844-test",
      rateLimit: async () => ({ ok: limitAllowed }),
    },
    "@/lib/request-security": { isSameOriginRequest: () => sameOrigin },
  });
  const api = routeLoader("@/app/api/enterprise/[organizationId]/workflow-schedules/route");
  const context = { params: Promise.resolve({ organizationId }) };
  const request = (payload = base) => ({
    url: "http://localhost:3000/api/enterprise/test/workflow-schedules",
    json: async () => payload,
  });
  const noSession = routeSession;
  routeSession = null;
  assert.equal((await api.GET(request(), context)).status, 401, "GET must require auth");
  assert.equal((await api.POST(request(), context)).status, 401, "POST must require auth");
  routeSession = noSession;

  sameOrigin = false;
  assert.equal((await api.POST(request(), context)).status, 403, "POST must reject cross-origin");
  sameOrigin = true;
  limitAllowed = false;
  assert.equal((await api.POST(request(), context)).status, 429, "POST must enforce rate limit");
  limitAllowed = true;
  workflowRights = { canRead: true, canCreateDraft: false };
  assert.equal((await api.POST(request(), context)).status, 403, "Read-only member cannot create");
  workflowRights = { canRead: true, canCreateDraft: true };
  sourceAllowed = false;
  assert.equal((await api.POST(request(), context)).status, 403, "Source entitlement is required");
  sourceAllowed = true;
  assert.equal((await api.POST(request({ ...base, status: "ENABLED" }), context)).status, 400,
    "Client cannot submit ENABLED");
  routeSession = { ...noSession, activeOrganizationId: otherTenant };
  assert.equal((await api.GET(request(), context)).status, 403, "GET rejects wrong active tenant");
  assert.equal((await api.POST(request(), context)).status, 403, "POST rejects wrong active tenant");
  routeSession = noSession;

  const createdViaApi = await api.POST(request(), context);
  assert.equal(createdViaApi.status, 201, "POST must persist a disabled draft");
  schedules.push(createdViaApi.body.schedule.id);
  assert.equal(createdViaApi.body.schedule.status, "DISABLED");
  assert.equal(auditCalls.length, 1, "POST writes a dedicated schedule audit");

  // STAGED is an internal test status: never leak it in the end-user list.
  const staged = await prisma.enterpriseWorkflowSchedule.create({
    data: {
      organizationId, workflowDefinitionId: own.definition.id, workflowVersionId: own.version.id,
      ...schedule, status: "STAGED", nextRunAt: new Date("2026-11-02T06:30:00Z"),
      createdByUserId: actor,
    },
  });
  schedules.push(staged.id);
  const list = await api.GET(request(), context);
  assert.equal(list.status, 200);
  assert.equal(list.body.pagination.total, 3);
  assert.ok(list.body.schedules.every((item) => item.status === "DISABLED"));
  assert.ok(!list.body.schedules.some((item) => item.id === staged.id));
  assert.ok(list.body.schedules.some((item) => item.id === createdViaApi.body.schedule.id));
  const restrictedList = await api.GET({
    url: request().url + "?pageSize=1&page=1",
  }, context);
  assert.equal(restrictedList.body.schedules.length, 1, "GET pagination is bounded");

  await assert.rejects(
    create({ organizationId: otherTenant, actorUserId: actor, payload: base, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE",
    "Cross-tenant definition/version rejected before writing",
  );
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: {
      workflowDefinitionId: own.definition.id, workflowVersionId: external.version.id, schedule,
    }, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE",
    "Cannot attach another tenant's version",
  );
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: {
      workflowDefinitionId: sourceless.definition.id, workflowVersionId: sourceless.version.id, schedule,
    }, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_SOURCE_REQUIRED",
  );
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: null },
  });
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: base, asOf: date }),
    (error) => error.code === "WORKFLOW_SCHEDULE_VERSION_NOT_ACTIVE",
    "Retired/replaced current version must fail closed",
  );
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: own.version.id },
  });
  await prisma.organizationMember.updateMany({
    where: { organizationId, userId: actor }, data: { removedAt: new Date() },
  });
  await assert.rejects(
    create({ organizationId, actorUserId: actor, payload: base, asOf: date }),
    (error) => error.code === "WORKFLOW_MEMBERSHIP_REQUIRED",
    "Revoked author cannot create schedule even through direct service invocation",
  );
  assert.equal(await prisma.enterpriseWorkflowSchedule.count({ where: { organizationId } }), 4);
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId } }), beforeRuns);

  // Static route gates complement real DB service assertions; no mock grants.
  const route = readFileSync("app/api/enterprise/[organizationId]/workflow-schedules/route.ts", "utf8");
  for (const guard of ["getSession", "getEnterpriseWorkflowAccess", "canCreateDraft",
    "requireWorkflowSourceAccess", "isSameOriginRequest", "rateLimit(", "writeAuditLog",
    "listReadableWorkflowEntityTypes", "status: \"DISABLED\""]) {
    assert.ok(route.includes(guard), `Schedule route missing guard: ${guard}`);
  }
  assert.ok(!route.includes("reserveDueStagedWorkflowOccurrence"));
  console.log("PASS WF-06S2A PostgreSQL: disabled-only drafts, 2 tenants, active membership, current version, DST fold, zero runs/receipts, live API handlers under controlled auth/source boundary.");
} finally {
  await prisma.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { scheduleId: { in: schedules } } });
  await prisma.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: definitions } } });
  await prisma.organizationMember.deleteMany({ where: { organizationId, userId: actor } });
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherTenant] } } });
  await prisma.user.deleteMany({ where: { id: actor } });
  await prisma.$disconnect();
}
