import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname) && /test/.test(url.pathname),
  "WF-06S2B requires an isolated localhost PostgreSQL test database");
const prisma = new PrismaClient();
const prefix = `wf846-${randomUUID()}`;
const tenant = `${prefix}-org`, other = `${prefix}-other`, actor = `${prefix}-actor`;
const schedules = [], definitions = [], versions = [], tasks = [];
const { EnterpriseWorkflowError } = workflowTestLoader({})("@/lib/enterprise/workflows/errors");
let session = { userId: actor, activeContext: "ORGANIZATION", activeOrganizationId: tenant };
let rights = { canEditDraft: true };
let sourceAllowed = true, originAllowed = true, limited = false;
const audits = [];

const loader = workflowTestLoader({
  "@/lib/prisma": { prisma },
  "@/lib/enterprise/workflows/adapters": {
    getWorkflowEntityAdapter: (type) => {
      if (type !== "EnterpriseTask") {
        throw new EnterpriseWorkflowError("Unsupported source.", 400, "WORKFLOW_ENTITY_TYPE_UNSUPPORTED", "CONFIGURATION");
      }
      return {
        entityType: type,
        loadEntity: async (org, id) => {
          const entity = await prisma.enterpriseTask.findFirst({
            where: { organizationId: org, id, archivedAt: null },
            select: { id: true, organizationId: true, status: true, revision: true, createdByUserId: true },
          });
          if (!entity) throw new EnterpriseWorkflowError("Source not found.", 404, "WORKFLOW_SOURCE_NOT_FOUND", "BUSINESS");
          return entity;
        },
      };
    },
  },
  "@/lib/enterprise/workflows/runtime-utils": {
    resolveWorkflowExecutionUser: async ({ organizationId, startedByUserId }) => {
      const member = await prisma.organizationMember.findFirst({
        where: { organizationId, userId: startedByUserId, status: "ACTIVE", removedAt: null },
      });
      if (!member || !sourceAllowed) {
        throw new EnterpriseWorkflowError("Mandate revoked.", 403, "WORKFLOW_EXECUTION_MANDATE_REVOKED", "SECURITY");
      }
      return startedByUserId;
    },
  },
  "@/lib/auth": { getSession: async () => session },
  "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
  "@/lib/audit": {
    writeApiLog: async () => {},
    writeAuditLog: async (entry) => { audits.push(entry); },
  },
  "@/lib/enterprise/workflows/access": {
    getEnterpriseWorkflowAccess: async (s, org) =>
      s.activeContext === "ORGANIZATION" && s.activeOrganizationId === org ? rights : null,
  },
  "@/lib/enterprise/workflows/source-access": {
    requireWorkflowSourceAccess: async ({ userId, organizationId, sourceEntityType }) => {
      if (!sourceAllowed || userId !== actor || organizationId !== tenant || sourceEntityType !== "EnterpriseTask") {
        throw new EnterpriseWorkflowError("Source module denied.", 403, "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED", "SECURITY");
      }
    },
  },
  "@/lib/request-security": { isSameOriginRequest: () => originAllowed },
  "@/lib/rate-limit": { getRateLimitKey: () => "wf846-test", rateLimit: async () => ({ ok: !limited }) },
});

const { bindDisabledScheduleMandate: bind, disabledScheduleMandateSchema: schema } =
  loader("@/lib/enterprise/workflows/schedule-mandate");
const { PATCH } = loader("@/app/api/enterprise/[organizationId]/workflow-schedules/[scheduleId]/mandate/route");
const { GET } = loader("@/app/api/enterprise/[organizationId]/workflow-schedules/route");
const routeContext = (scheduleId, org = tenant) => ({ params: Promise.resolve({ scheduleId, organizationId: org }) });
const request = (input) => ({
  url: `http://localhost:3000/api/enterprise/${tenant}/workflow-schedules`,
  json: async () => input,
});

try {
  for (const id of [tenant, other]) {
    await prisma.organization.create({
      data: { id, name: "WF-06S2B fixture", organizationType: "CLIENT", status: "ACTIVE" },
    });
  }
  await prisma.user.create({
    data: { id: actor, email: `${actor}@example.test`, name: "Inert mandate QA", passwordHash: "test-only" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: tenant, userId: actor, role: "OWNER", status: "ACTIVE" },
  });
  const define = async (org, code) => {
    const definition = await prisma.enterpriseWorkflowDefinition.create({
      data: {
        organizationId: org, code: `WF846_${code}`, name: "WF846 source mandate",
        status: "ACTIVE", triggerType: "MANUAL", triggerEntityType: "EnterpriseTask", createdByUserId: actor,
      },
    });
    definitions.push(definition.id);
    const version = await prisma.enterpriseWorkflowVersion.create({
      data: {
        organizationId: org, definitionId: definition.id, versionNumber: 1,
        status: "PUBLISHED", publishedAt: new Date(), createdByUserId: actor,
      },
    });
    versions.push(version.id);
    await prisma.enterpriseWorkflowDefinition.update({
      where: { id: definition.id }, data: { currentVersionId: version.id },
    });
    return { definition, version };
  };
  const own = await define(tenant, "A");
  await define(other, "B");
  const createTask = async (org) => {
    const task = await prisma.enterpriseTask.create({
      data: { organizationId: org, title: "WF846 inert source fixture", createdByUserId: actor },
    });
    tasks.push(task.id);
    return task;
  };
  const firstTask = await createTask(tenant);
  const foreignTask = await createTask(other);
  const initial = await prisma.enterpriseWorkflowSchedule.create({
    data: {
      organizationId: tenant, workflowDefinitionId: own.definition.id, workflowVersionId: own.version.id,
      frequency: "DAILY", timeZone: "Africa/Kinshasa", hour: 9, minute: 0,
      status: "DISABLED", createdByUserId: actor,
    },
  });
  schedules.push(initial.id);
  const data = { sourceEntityId: firstTask.id, revision: initial.revision };

  assert.equal(schema.safeParse({ ...data, executionActorUserId: "system" }).success, false);
  assert.equal(schema.safeParse({ ...data, status: "ENABLED" }).success, false);
  assert.equal(schema.safeParse({ ...data, sourceEntityType: "EnterprisePayment" }).success, false);
  assert.equal(schema.safeParse({ ...data, revision: -1 }).success, false);

  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 200);
  assert.equal(audits.length, 1);
  const stored = await prisma.enterpriseWorkflowSchedule.findFirstOrThrow({ where: { id: initial.id, organizationId: tenant } });
  assert.equal(stored.status, "DISABLED");
  assert.equal(stored.sourceEntityType, "EnterpriseTask");
  assert.equal(stored.sourceEntityId, firstTask.id);
  assert.equal(stored.executionActorUserId, actor);
  assert.ok(stored.mandateVerifiedAt instanceof Date);
  assert.equal(stored.revision, initial.revision + 1);
  const get = await GET(request(), { params: Promise.resolve({ organizationId: tenant }) });
  assert.equal(get.status, 200);
  assert.equal(get.body.schedules.length, 1);
  assert.equal(get.body.schedules[0].sourceEntityId, firstTask.id);
  assert.equal(get.body.schedules[0].executionActorUserId, actor);
  assert.ok(!("entity" in get.body.schedules[0]), "GET must not return ERP source snapshot");

  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 409, "Stale revision rejects replay");
  assert.equal((await PATCH(request({ ...data, revision: stored.revision, sourceEntityId: foreignTask.id }), routeContext(initial.id))).status, 404, "Cross tenant source rejects");
  assert.equal((await PATCH(request({ ...data, revision: stored.revision, sourceEntityId: "missing" }), routeContext(initial.id))).status, 404);

  session = null;
  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 401);
  session = { userId: actor, activeContext: "ORGANIZATION", activeOrganizationId: tenant };
  originAllowed = false;
  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 403);
  originAllowed = true;
  limited = true;
  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 429);
  limited = false;
  rights = { canEditDraft: false };
  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 403);
  rights = { canEditDraft: true };
  sourceAllowed = false;
  assert.equal((await PATCH(request({ ...data, revision: stored.revision }), routeContext(initial.id))).status, 403);
  sourceAllowed = true;
  session = { userId: actor, activeContext: "ORGANIZATION", activeOrganizationId: other };
  assert.equal((await PATCH(request(data), routeContext(initial.id))).status, 403);
  session = { userId: actor, activeContext: "ORGANIZATION", activeOrganizationId: tenant };

  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: null },
  });
  await assert.rejects(
    bind({ organizationId: tenant, scheduleId: initial.id, actorUserId: actor,
      payload: { ...data, revision: stored.revision } }),
    (err) => err.code === "WORKFLOW_MANDATE_VERSION_CONFLICT",
  );
  await prisma.enterpriseWorkflowDefinition.update({
    where: { id: own.definition.id }, data: { currentVersionId: own.version.id },
  });

  const bound = await bind({
    organizationId: tenant, scheduleId: initial.id, actorUserId: actor,
    payload: { ...data, revision: stored.revision },
  });
  assert.equal(bound.revision, stored.revision + 1);
  assert.equal(bound.status, "DISABLED");

  // The database must refuse partial mandates even through direct Prisma access.
  await assert.rejects(prisma.enterpriseWorkflowSchedule.update({
    where: { id: initial.id }, data: { sourceEntityId: null },
  }), "DB CHECK blocks incomplete source/actor tuple");

  await prisma.enterpriseWorkflowSchedule.update({ where: { id: initial.id }, data: { status: "PAUSED" } });
  assert.equal((await PATCH(request({ ...data, revision: bound.revision }), routeContext(initial.id))).status, 404,
    "Non-disabled schedules cannot be rebound");
  await prisma.enterpriseWorkflowSchedule.update({ where: { id: initial.id }, data: { status: "DISABLED" } });

  await prisma.organizationMember.updateMany({
    where: { organizationId: tenant, userId: actor }, data: { removedAt: new Date() },
  });
  await assert.rejects(bind({
    organizationId: tenant, scheduleId: initial.id, actorUserId: actor,
    payload: { ...data, revision: bound.revision },
  }), (err) => err.code === "WORKFLOW_EXECUTION_MANDATE_REVOKED");
  assert.equal(await prisma.enterpriseWorkflowRun.count({ where: { organizationId: tenant } }), 0);
  assert.equal(await prisma.enterpriseWorkflowScheduleOccurrence.count({ where: { organizationId: tenant } }), 0);
  assert.equal(await prisma.enterpriseDomainEvent.count({ where: { organizationId: tenant } }), 0);

  const route = readFileSync("app/api/enterprise/[organizationId]/workflow-schedules/[scheduleId]/mandate/route.ts", "utf8");
  for (const required of ["getSession", "getEnterpriseWorkflowAccess", "canEditDraft",
    "requireWorkflowSourceAccess", "isSameOriginRequest", "rateLimit(", "writeAuditLog", "bindDisabledScheduleMandate"]) {
    assert.ok(route.includes(required), `Missing mandatory API gate: ${required}`);
  }
  assert.ok(!route.includes("startWorkflowRun") && !route.includes("reserveDueStagedWorkflowOccurrence"));
  console.log("PASS WF-06S2B PostgreSQL: bounded mandate, self actor, tenant source, version/revision CAS, DB CHECK, guarded PATCH/GET and zero ERP runs/events/receipts.");
} finally {
  await prisma.enterpriseWorkflowScheduleOccurrence.deleteMany({ where: { scheduleId: { in: schedules } } });
  await prisma.enterpriseWorkflowSchedule.deleteMany({ where: { id: { in: schedules } } });
  await prisma.enterpriseTask.deleteMany({ where: { id: { in: tasks } } });
  await prisma.enterpriseWorkflowVersion.deleteMany({ where: { id: { in: versions } } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { id: { in: definitions } } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: tenant, userId: actor } });
  await prisma.organization.deleteMany({ where: { id: { in: [tenant, other] } } });
  await prisma.user.deleteMany({ where: { id: actor } });
  await prisma.$disconnect();
}
