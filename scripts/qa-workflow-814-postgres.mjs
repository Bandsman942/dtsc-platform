import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1", "::1"].includes(database.hostname) && /test/.test(database.pathname), "WF-01 requires an isolated local test PostgreSQL database");
const prisma = new PrismaClient();
const organizationId = `wf814-${randomUUID()}`;
const otherTenant = `${organizationId}-other`;
const maker = `${organizationId}-maker`, checker = `${organizationId}-checker`, member = `${organizationId}-member`;
let registry;
// Actual engine, adapters, approval services, role/tenant access, notifications,
// transactions and database. Billing subscription and external push are fixtures.
// Unused posting/receipt services fail closed; these tests do not certify posting.
const unused = new Proxy({}, { get: (_, key) => { if (key === "__esModule") return false; return () => { throw new Error(`Unexpected out-of-scope service: ${String(key)}`); }; } });
const load = workflowTestLoader({
  "@/lib/prisma": { prisma },
  "@/lib/billing/entitlements": { getOrganizationEntitlements: async () => ({ businessSubtypeCode: null, modules: registry.map((module) => ({ id: module.code, moduleCode: module.code, isEnabled: true, allowed: true, message: "Test subscription" })) }) },
  "@/lib/push/queue": { enqueueWebPushNotification: async () => {} },
  "@/lib/enterprise/procurement/common-domain-adapter": unused,
  "@/lib/enterprise/finance/report-service": unused,
  "@/lib/enterprise/accounting/receivables-service": unused,
  "@/lib/enterprise/accounting/payables-service": unused,
  "@/lib/enterprise/accounting/payments-service": unused,
  "@/lib/enterprise/accounting/journal-service": unused,
  "@/lib/enterprise/accounting/asset-accounting-service": unused,
  "@/lib/enterprise/accounting/accounting-document-approval-orchestration": unused,
});
registry = load("@/lib/enterprise/module-registry").ENTERPRISE_MODULE_REGISTRY;
const adapters = load("@/lib/enterprise/workflows/adapters");
const engine = load("@/lib/enterprise/workflows/engine");
const definitions = load("@/lib/enterprise/workflows/definitions");
const { ENTERPRISE_WORKFLOW_TEMPLATES: templates } = load("@/lib/enterprise/workflows/templates");
const { getWorkflowTemplateCompatibility } = load("@/lib/enterprise/workflows/capabilities");
const access = load("@/lib/enterprise/module-access");
const { workflowSourceModule } = load("@/lib/enterprise/workflows/runtime-utils");
const decisions = {
  EnterpriseTask: load("@/lib/enterprise/core-v2/service").decideEnterpriseApproval,
  EnterpriseRequest: load("@/lib/enterprise/core-v2/service").decideEnterpriseApproval,
  EnterpriseMeeting: load("@/lib/enterprise/core-v2/service").decideEnterpriseApproval,
  EnterprisePurchase: load("@/lib/enterprise/procurement/purchase-service").decideEnterprisePurchaseApproval,
  EnterpriseBudget: load("@/lib/enterprise/finance/budget-service").decideEnterpriseBudgetApproval,
  EnterpriseExpense: load("@/lib/enterprise/finance/expense-service").decideEnterpriseExpenseApproval,
};
let departmentId, supplierId, sequence = 0;
async function source(entityType) {
  const reference = `${organizationId}-${sequence++}`;
  const common = { organizationId, title: "WF-01 fixture", departmentId };
  if (entityType === "EnterpriseTask") return prisma.enterpriseTask.create({ data: { ...common, createdByUserId: maker } });
  if (entityType === "EnterpriseRequest") return prisma.enterpriseRequest.create({ data: { ...common, requestType: "GENERAL", description: "Test", requestedByUserId: maker, status: "SUBMITTED" } });
  if (entityType === "EnterpriseMeeting") return prisma.enterpriseMeeting.create({ data: { ...common, organizerUserId: maker, startAt: new Date(), endAt: new Date(Date.now() + 60_000) } });
  if (entityType === "EnterpriseBudget") return prisma.enterpriseBudget.create({ data: { ...common, reference, createdByUserId: maker, periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31"), lines: { create: { name: "Line", plannedAmount: "100" } } } });
  if (entityType === "EnterpriseExpense") return prisma.enterpriseExpense.create({ data: { ...common, reference, createdByUserId: maker, requestedByUserId: maker, expenseDate: new Date(), amount: "10" } });
  if (entityType === "EnterprisePurchase") {
    const purchase = await prisma.enterprisePurchase.create({ data: { ...common, reference, supplierId, createdByUserId: maker, requestedByUserId: maker, totalAmount: "10", items: { create: { description: "Service", quantity: "1", unit: "EA", unitPrice: "10", lineSubtotal: "10", taxAmount: "0", lineTotal: "10" } } }, include: { items: true } });
    await prisma.enterprisePurchaseItemCatalogLink.create({ data: { organizationId, purchaseItemId: purchase.items[0].id, expectedItemType: "SERVICE" } });
    return purchase;
  }
  throw new Error(`Unknown fixture ${entityType}`);
}
let checkedVersionCas = false;
async function publish(entityType, version) {
  const definition = await definitions.createWorkflowDefinition(organizationId, maker, { name: `WF-01 ${sequence++}`, triggerType: "MANUAL", triggerEntityType: entityType, allowManualStart: true });
  const versionId = definition.versions[0].id;
  const draftBefore = checkedVersionCas ? null : await definitions.getWorkflowDefinition(organizationId, definition.id);
  const initialToken = draftBefore ? definitions.workflowVersionEditToken(draftBefore.versions.find(item => item.id === versionId)) : undefined;
  const saved = await definitions.saveWorkflowVersion(organizationId, definition.id, versionId, maker, version, initialToken);
  assert.equal(saved.readiness.ready, true, JSON.stringify(saved.readiness));
  if (!checkedVersionCas) {
    checkedVersionCas = true;
    const before = await prisma.enterpriseWorkflowStep.count({ where: { organizationId, workflowVersionId: versionId } });
    await assert.rejects(
      definitions.saveWorkflowVersion(organizationId, definition.id, versionId, checker, version, initialToken),
      (error) => error.code === "WORKFLOW_DRAFT_CONFLICT" && error.status === 409,
      "PostgreSQL must reject stale edits after serializing on the actual version row",
    );
    assert.equal(await prisma.enterpriseWorkflowStep.count({ where: { organizationId, workflowVersionId: versionId } }), before, "Conflict must not remove existing steps");
  }
  await definitions.publishWorkflowVersion(organizationId, definition.id, versionId, maker);
  return definition;
}
async function decide(entityType, approval, extra = {}) {
  return decisions[entityType]({ organizationId, approvalId: approval.id, actorUserId: checker, action: "APPROVE", revision: approval.revision, canManage: false, ...extra });
}
try {
  for (const id of [organizationId, otherTenant]) await prisma.organization.create({ data: { id, name: "WF-01 fixture", organizationType: "CLIENT", status: "ACTIVE", sectorCode: "PHARMACY" } });
  for (const [id, role] of [[maker, "OWNER"], [checker, "ADMIN_ENTREPRISE"], [member, "MEMBER"]]) {
    await prisma.user.create({ data: { id, email: `${id}@example.test`, name: role, passwordHash: "disabled-test-fixture" } });
    await prisma.organizationMember.create({ data: { organizationId, userId: id, role, status: "ACTIVE" } });
  }
  departmentId = (await prisma.enterpriseDepartment.create({ data: { organizationId, departmentCode: "WF814", labelFr: "Test", labelEn: "Test", responsibleUserId: checker } })).id;
  supplierId = (await prisma.enterpriseSupplier.create({ data: { organizationId, legalName: "Test", normalizedName: "wf814", status: "ACTIVE", createdByUserId: maker } })).id;

  // All six actual approval targets, with authoritative tenant, SoD, revision
  // and designated-checker checks. No Prisma status writes simulate a decision.
  for (const entityType of Object.keys(decisions)) {
    const entity = await source(entityType);
    const adapter = adapters.getWorkflowEntityAdapter(entityType);
    const input = { organizationId, entityId: entity.id, actorUserId: maker, approverUserId: checker, revision: entity.revision };
    await assert.rejects(adapter.createApproval({ ...input, approverUserId: maker }));
    await assert.rejects(adapter.createApproval({ ...input, organizationId: otherTenant }));
    const financial = ["EnterprisePurchase", "EnterpriseBudget", "EnterpriseExpense"].includes(entityType);
    if (financial) {
      await assert.rejects(adapter.createApproval({ ...input, approverUserId: member }), (error) => error.code === "APPROVER_NOT_ELIGIBLE");
      await assert.rejects(adapter.createApproval({ ...input, revision: 0 }), (error) => error.code === "REVISION_CONFLICT");
    }
    const approval = await adapter.createApproval(input);
    assert.equal(approval.approverUserId, checker);
    await assert.rejects(adapter.createApproval(input));
    await assert.rejects(decide(entityType, approval, { actorUserId: maker }));
    await assert.rejects(decide(entityType, approval, { organizationId: otherTenant }));
    await assert.rejects(decide(entityType, approval, { revision: 0 }));
    const results = await Promise.allSettled([decide(entityType, approval), decide(entityType, approval)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1, `${entityType}: exactly one decision`);
    assert.equal(await prisma.enterpriseOperationalEvent.count({ where: { organizationId, entityId: approval.id, eventType: "ENTERPRISE_APPROVAL_APPROVED" } }), 1);
    assert.equal((await prisma.enterpriseApproval.findUniqueOrThrow({ where: { id: approval.id } })).revision, 2);
    await assert.rejects(decide(entityType, approval));
  }

  // Every catalogue entry goes through the real create/save/publish services.
  // The four supported templates then execute all steps to completion.
  for (const template of templates) {
    if (!getWorkflowTemplateCompatibility(template).ready) {
      const count = await prisma.enterpriseWorkflowDefinition.count({ where: { organizationId } });
      await assert.rejects(definitions.createWorkflowFromTemplate(organizationId, maker, template.code), (error) => error.code === "WORKFLOW_TEMPLATE_INCOMPATIBLE");
      assert.equal(await prisma.enterpriseWorkflowDefinition.count({ where: { organizationId } }), count, "Refusal creates no orphan draft");
      const draft = await definitions.createWorkflowDefinition(organizationId, maker, { name: `Blocked ${sequence++}`, triggerType: "MANUAL", triggerEntityType: template.triggerEntityType });
      const saved = await definitions.saveWorkflowVersion(organizationId, draft.id, draft.versions[0].id, maker, template.version);
      assert.equal(saved.readiness.ready, false);
      await assert.rejects(definitions.publishWorkflowVersion(organizationId, draft.id, draft.versions[0].id, maker), (error) => error.code === "WORKFLOW_NOT_READY");
      continue;
    }
    const definition = await definitions.createWorkflowFromTemplate(organizationId, maker, template.code, "en");
    const version = definition.versions[0];
    await definitions.publishWorkflowVersion(organizationId, definition.id, version.id, maker);
    await assert.rejects(definitions.saveWorkflowVersion(organizationId, definition.id, version.id, maker, template.version), (error) => error.code === "PUBLISHED_WORKFLOW_IMMUTABLE");
    const entity = await source(template.triggerEntityType);
    if (template.triggerEntityType !== "EnterpriseRequest") await adapters.getWorkflowEntityAdapter(template.triggerEntityType).createApproval({ organizationId, entityId: entity.id, actorUserId: maker, approverUserId: checker, revision: entity.revision });
    const run = await engine.startWorkflowRun({ organizationId, workflowDefinitionId: definition.id, sourceEntityType: template.triggerEntityType, sourceEntityId: entity.id, triggerType: "MANUAL", startedByUserId: maker });
    assert.equal(run.status, "WAITING_APPROVAL", `${template.code}: ${run.failureMessage}`);
    const approval = await prisma.enterpriseApproval.findFirstOrThrow({ where: { organizationId, workflowRunId: run.id } });
    assert.equal(await prisma.enterpriseApproval.count({ where: { organizationId, targetEntityId: entity.id } }), 1, "Existing canonical request is linked without duplication");
    await decide(template.triggerEntityType, approval);
    await engine.resumeWorkflowFromApproval(approval.id, checker);
    const finished = await prisma.enterpriseWorkflowRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(finished.status, "COMPLETED", `${template.code}: ${finished.failureMessage}`);
    assert.equal(await prisma.notification.count({ where: { organizationId, id: { startsWith: "wf_" } } }) > 0, true);
    if (template.triggerEntityType === "EnterpriseRequest") assert.equal(await prisma.enterpriseTask.count({ where: { organizationId, sourceEntityId: entity.id } }), 1);
  }

  // Canonical access remains sector-aware; no workflow module registry bypasses it.
  for (const sectorCode of ["PHARMACY", "HEALTH", "RETAIL"]) {
    await prisma.organization.update({ where: { id: organizationId }, data: { sectorCode } });
    for (const entityType of ["EnterprisePurchase", "EnterpriseBudget", "EnterpriseExpense"]) {
      assert.equal((await access.resolveEnterpriseModuleAccess({ userId: checker, organizationId, moduleCode: workflowSourceModule(entityType), action: "approve" })).allowed, true);
      assert.equal((await access.resolveEnterpriseModuleAccess({ userId: member, organizationId, moduleCode: workflowSourceModule(entityType), action: "approve" })).allowed, false);
    }
  }

  // The actual engine must choose the post-action status, not its old TODO snapshot.
  const actionGraph = {
    steps: [
      { code: "START", name: "Start", stepType: "START", position: 0, configuration: {} },
      { code: "ACT", name: "Start task", stepType: "DOMAIN_ACTION", position: 1, configuration: { action: "START" } },
      { code: "POST_ACTION", name: "Post action", stepType: "END", position: 2, configuration: { outcome: "COMPLETED" } },
      { code: "STALE", name: "Stale branch", stepType: "END", position: 3, configuration: { outcome: "REJECTED" } },
    ],
    transitions: [
      { fromStepCode: "START", toStepCode: "ACT", outcome: "DEFAULT", priority: 0 },
      { fromStepCode: "ACT", toStepCode: "POST_ACTION", outcome: "DEFAULT", priority: 0, condition: { field: "status", operator: "EQUALS", value: "IN_PROGRESS" } },
      { fromStepCode: "ACT", toStepCode: "STALE", outcome: "DEFAULT", priority: 1 },
    ],
  };
  const definition = await publish("EnterpriseTask", actionGraph);
  const task = await source("EnterpriseTask");
  const run = await engine.startWorkflowRun({ organizationId, workflowDefinitionId: definition.id, sourceEntityType: "EnterpriseTask", sourceEntityId: task.id, triggerType: "MANUAL", startedByUserId: maker });
  assert.equal(run.status, "COMPLETED", run.failureMessage || "Post-action branch must win");
  assert.equal(run.version.steps.find((step) => step.id === run.currentStepId).code, "POST_ACTION");
  assert.equal((await prisma.enterpriseTask.findUniqueOrThrow({ where: { id: task.id } })).revision, 2);
  console.log("WF-01 PostgreSQL passed: six canonical approval targets, SoD/tenant/revision/role checks, concurrent decisions, nine templates, real enabled-template execution, sector access, immutable versions and post-action engine routing.");
} finally {
  // Scoped cleanup only, respecting FKs; no production or remote database allowed.
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.enterpriseApproval.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowRun.deleteMany({ where: { organizationId } });
  await prisma.enterpriseWorkflowDefinition.deleteMany({ where: { organizationId } });
  await prisma.enterpriseDomainEvent.deleteMany({ where: { organizationId } });
  await prisma.enterpriseOperationalEvent.deleteMany({ where: { organizationId } });
  await prisma.enterpriseEntityLink.deleteMany({ where: { organizationId } });
  await prisma.enterpriseExpense.deleteMany({ where: { organizationId } });
  await prisma.enterprisePurchaseItemCatalogLink.deleteMany({ where: { organizationId } });
  await prisma.enterprisePurchase.deleteMany({ where: { organizationId } });
  await prisma.enterpriseBudget.deleteMany({ where: { organizationId } });
  await prisma.enterpriseSupplier.deleteMany({ where: { organizationId } });
  await prisma.enterpriseTask.deleteMany({ where: { organizationId } });
  await prisma.enterpriseRequest.deleteMany({ where: { organizationId } });
  await prisma.enterpriseMeeting.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherTenant] } } });
  await prisma.user.deleteMany({ where: { id: { in: [maker, checker, member] } } });
  await prisma.$disconnect();
}
