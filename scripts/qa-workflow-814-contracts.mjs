import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

// Real templates, schemas, adapters, graph/readiness, condition evaluation and
// canonical module registry. Service spies verify delegation, not domain rules.
const calls = [];
const spy = (name) => async (...args) => { calls.push({ name, args }); return { id: "approval", status: "PENDING" }; };
const service = (names) => Object.fromEntries(names.map((name) => [name, spy(name)]));
const overrides = {
  "@/lib/enterprise/core-v2/service": service(["createEnterpriseApproval", "transitionEnterpriseTask", "transitionEnterpriseRequest", "transitionEnterpriseMeeting"]),
  "@/lib/enterprise/procurement/purchase-service": service(["createEnterprisePurchaseApproval", "transitionEnterprisePurchase"]),
  "@/lib/enterprise/finance/budget-service": service(["createEnterpriseBudgetApproval", "transitionEnterpriseBudget"]),
  "@/lib/enterprise/finance/expense-service": service(["createEnterpriseExpenseApproval", "transitionEnterpriseExpense"]),
  "@/lib/enterprise/finance/report-service": service(["transitionEnterpriseReport"]),
  "@/lib/enterprise/accounting/receivables-service": service(["transitionSalesInvoice"]),
  "@/lib/enterprise/accounting/payables-service": service(["transitionSupplierInvoice"]),
  "@/lib/enterprise/accounting/payments-service": service(["transitionEnterprisePayment"]),
  "@/lib/enterprise/accounting/journal-service": service(["transitionJournalEntry"]),
  "@/lib/enterprise/accounting/asset-accounting-service": service(["postAssetDepreciation"]),
  "@/lib/enterprise/accounting/accounting-document-approval-orchestration": service(["postApprovedSalesCreditNote", "postApprovedSupplierCreditNote"]),
};
let lastRead;
const prisma = Object.fromEntries(Prisma.dmmf.datamodel.models.map((model) => [model.name[0].toLowerCase() + model.name.slice(1), { findFirst: async (query) => { lastRead = query; return { id: "source", organizationId: "tenant", revision: 8, status: "APPROVED" }; } }]));
overrides["@/lib/prisma"] = { prisma };
const load = workflowTestLoader(overrides);
const { ENTERPRISE_WORKFLOW_TEMPLATES: templates } = load("@/lib/enterprise/workflows/templates");
const { WORKFLOW_ENTITY_TYPES: entities } = load("@/lib/enterprise/workflows/constants");
const { getWorkflowEntityAdapter } = load("@/lib/enterprise/workflows/adapters");
const { getWorkflowContractReadiness: readiness, getWorkflowTemplateCompatibility: compatibility } = load("@/lib/enterprise/workflows/capabilities");
const { evaluateWorkflowCondition, workflowConditionError } = load("@/lib/enterprise/workflows/conditions");
const { workflowSourceModule } = load("@/lib/enterprise/workflows/runtime-utils");
const { loadWorkflowTransitionEntity } = load("@/lib/enterprise/workflows/transition-entity");
const { workflowReadinessMessage } = load("@/lib/enterprise/workflows/readiness-messages");
const { createWorkflowFromTemplate } = load("@/lib/enterprise/workflows/definitions");
const supported = ["EnterpriseTask", "EnterpriseRequest", "EnterpriseMeeting", "EnterprisePurchase", "EnterpriseBudget", "EnterpriseExpense"];
const enabled = templates.map((template) => template.code);
assert.equal(templates.length, 9);
for (const template of templates) {
  const result = compatibility(template);
  assert.equal(result.ready, enabled.includes(template.code), `${template.code}: ${JSON.stringify(result.blockers)}`);
  if (!result.ready) {
    assert.ok(result.blockers.some((item) => item.code === "APPROVAL_TARGET_UNSUPPORTED"));
    await assert.rejects(createWorkflowFromTemplate("tenant", "maker", template.code, "en"), (error) => error.code === "WORKFLOW_TEMPLATE_INCOMPATIBLE");
  }
}
const input = { organizationId: "tenant", entityId: "source", actorUserId: "maker", approverUserId: "checker", revision: 7 };
const approvalGraph = templates[1].version;
for (const entityType of entities) {
  const adapter = getWorkflowEntityAdapter(entityType);
  assert.ok(workflowSourceModule(entityType), `Canonical module for ${entityType}`);
  const result = readiness({ triggerEntityType: entityType, triggerEventType: null }, approvalGraph);
  assert.equal(result.blockers.some((item) => item.code === "APPROVAL_TARGET_UNSUPPORTED"), !supported.includes(entityType), entityType);
  assert.equal(typeof adapter.createApproval === "function", supported.includes(entityType));
  if (adapter.createApproval) {
    const before = calls.length;
    await adapter.createApproval(input);
    assert.equal(calls.length, before + 1);
    const call = calls.at(-1);
    assert.equal(call.args[0].organizationId, input.organizationId);
    assert.equal(call.args[0].actorUserId, input.actorUserId);
    assert.equal(call.args[0].approverUserId, input.approverUserId);
    if (["EnterpriseTask", "EnterpriseRequest", "EnterpriseMeeting"].includes(entityType)) {
      assert.equal(call.name, "createEnterpriseApproval");
      assert.equal(call.args[0].targetEntityType, entityType);
      assert.equal(call.args[0].targetEntityId, input.entityId);
    } else {
      const kind = entityType.replace("Enterprise", "");
      assert.equal(call.name, `createEnterprise${kind}Approval`);
      assert.equal(call.args[0][`${kind.toLowerCase()}Id`], input.entityId);
      assert.equal(call.args[0][`${kind.toLowerCase()}Revision`], input.revision);
    }
  }
  await adapter.loadEntity(input.organizationId, input.entityId);
  assert.equal(lastRead.where.organizationId, input.organizationId);
  assert.equal(lastRead.where.id, input.entityId);
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === entityType);
  for (const [field, type] of adapter.conditionFields) {
    assert.equal(lastRead.select[field], true, `${entityType}.${field} must actually be loaded`);
    const scalar = model.fields.find((item) => item.name === field)?.type;
    const actual = scalar === "DateTime" ? "DATE" : ["Decimal", "Int", "Float"].includes(scalar) ? "NUMBER" : scalar === "Boolean" ? "BOOLEAN" : "STRING";
    assert.equal(type, actual, `${entityType}.${field}`);
  }
  for (const action of adapter.domainActions) {
    const before = calls.length;
    await adapter.executeDomainAction({ ...input, action });
    assert.equal(calls.length, before + 1, `${entityType}/${action} delegates exactly once`);
  }
  await assert.rejects(adapter.executeDomainAction({ ...input, action: "UNSUPPORTED" }));
}

const source = { triggerEntityType: "EnterprisePurchase", triggerEventType: "ENTERPRISE_PURCHASE_SUBMITTED" };
const graph = { steps: [{ code: "START", name: "Start", stepType: "START", position: 0, configuration: {} }, { code: "END", name: "End", stepType: "END", position: 1, configuration: { outcome: "COMPLETED" } }], transitions: [{ fromStepCode: "START", toStepCode: "END", outcome: "DEFAULT", priority: 0 }] };
const blocked = (candidate, code) => assert.ok(readiness(source, candidate).blockers.some((item) => item.code === code), `${code}: ${JSON.stringify(readiness(source, candidate))}`);
for (const [condition, code] of [
  [{ field: "privateBankAccount", operator: "EQUALS", value: "x" }, "INVALID_CONDITION_FIELD"],
  [{ field: "totalAmount", operator: "EQUALS", value: true }, "INVALID_CONDITION_VALUE"],
  [{ field: "status", operator: "EQUALS", value: 1 }, "INVALID_CONDITION_VALUE"],
  [{ field: "status", operator: "IN", value: "APPROVED" }, "INVALID_CONDITION_VALUE"],
  [{ field: "status", operator: "IN", value: [] }, "INVALID_CONDITION_VALUE"],
  [{ field: "status", operator: "GREATER_THAN", value: "DRAFT" }, "INVALID_CONDITION_OPERATOR"],
  [{ field: "expectedAt", operator: "EQUALS", value: "2026-02-30" }, "INVALID_CONDITION_VALUE"],
  [{ field: "totalAmount", operator: "EXISTS", value: 0 }, "INVALID_CONDITION_VALUE"],
]) blocked({ ...graph, transitions: [{ ...graph.transitions[0], condition }] }, code);
blocked({ ...graph, transitions: [{ ...graph.transitions[0], outcome: "APPROVED" }] }, "INVALID_TRANSITION_OUTCOME");
blocked({ ...graph, transitions: [{ ...graph.transitions[0], condition: { field: "status", operator: "EQUALS", value: "APPROVED" } }] }, "UNCOVERED_TRANSITION_OUTCOME");
blocked({ ...graph, transitions: [graph.transitions[0], { ...graph.transitions[0], priority: 1 }] }, "SHADOWED_TRANSITION");
blocked({ ...approvalGraph, transitions: approvalGraph.transitions.filter((route) => route.outcome !== "CANCELLED") }, "UNCOVERED_TRANSITION_OUTCOME");
blocked({ ...approvalGraph, transitions: [...approvalGraph.transitions, { fromStepCode: "APPROVAL", toStepCode: "END_REJECTED", outcome: "DEFAULT", priority: 0 }] }, "AMBIGUOUS_BRANCH");
const financialCodes = [
  "SUPPLIER_INVOICE_REVIEW_APPROVAL_POSTING",
  "SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION",
  "CASH_SESSION_INDEPENDENT_CLOSE",
  "MANUAL_JOURNAL_APPROVAL_POSTING",
  "FISCAL_PERIOD_CLOSE_REVIEW",
];
for (const code of financialCodes) {
  const template = templates.find((item) => item.code === code);
  assert.ok(template, code);
  assert.equal(compatibility(template).ready, true, code);
  const adapter = getWorkflowEntityAdapter(template.triggerEntityType);
  const approvals = template.version.steps.filter((step) => step.stepType === "CREATE_APPROVAL");
  assert.ok(approvals.length >= 1);
  for (const step of approvals) {
    assert.ok(adapter.canonicalApprovalTargets?.has(step.configuration.canonicalApprovalTarget),
      code + " only attaches a correct canonical target");
  }
  assert.ok(template.version.steps.every((step) => step.stepType !== "DOMAIN_ACTION"),
    "Financial posting/confirmation cannot be automated by workflow");
  const altered = {
    ...template.version,
    steps: template.version.steps.map((step) =>
      step.stepType === "CREATE_APPROVAL"
        ? { ...step, configuration: { ...step.configuration, canonicalApprovalTarget: "EnterprisePayrollRun" } }
        : step),
  };
  assert.equal(compatibility({ ...template, version: altered }).ready, false,
    code + " fail closed on an unlisted finance approval");
}
const paymentTemplate = templates.find((template) => template.code === "SUPPLIER_PAYMENT_APPROVAL_CONFIRMATION");
assert.ok(paymentTemplate.version.steps.some((step) => step.stepType === "CONDITION"
  && step.configuration.condition.field === "paymentType"
  && step.configuration.condition.value === "SUPPLIER_PAYMENT"));
assert.ok(paymentTemplate.version.transitions.some((route) => route.fromStepCode === "IS_SUPPLIER_PAYMENT"
  && route.outcome === "FALSE" && route.toStepCode === "END_OUT_OF_SCOPE"));
const cash = templates.find((template) => template.triggerEntityType === "EnterpriseCashSession");
assert.equal(compatibility(cash).ready, true);
const adapter = getWorkflowEntityAdapter("EnterprisePurchase");
const entity = { id: "source", organizationId: "tenant", revision: 7, status: "DRAFT", totalAmount: new Prisma.Decimal("9007199254740993.01"), expectedAt: new Date("2026-01-01T00:00:00Z") };
assert.equal(evaluateWorkflowCondition(adapter, entity, { field: "totalAmount", operator: "EQUALS", value: "9007199254740993.010" }), true);
assert.equal(evaluateWorkflowCondition(adapter, entity, { field: "expectedAt", operator: "GREATER_THAN", value: "2025-12-31" }), true);
assert.equal(evaluateWorkflowCondition(adapter, entity, { field: "expectedAt", operator: "IN", value: ["2026-01-01"] }), true);
assert.equal(evaluateWorkflowCondition(adapter, { ...entity, totalAmount: null }, { field: "totalAmount", operator: "LESS_THAN", value: 1 }), false);
assert.equal(workflowConditionError(adapter, { field: "totalAmount", operator: "IN", value: ["1.00", "2.00"] }), null);
assert.throws(() => evaluateWorkflowCondition(adapter, entity, { field: "constructor", operator: "EXISTS" }));
const current = await loadWorkflowTransitionEntity(adapter, "tenant", "source", entity, { revision: 8 });
assert.equal(evaluateWorkflowCondition(adapter, current, { field: "status", operator: "EQUALS", value: "APPROVED" }), true);
await assert.rejects(loadWorkflowTransitionEntity(adapter, "tenant", "source", entity, { revision: 9 }), (error) => error.code === "WORKFLOW_SOURCE_REVISION_CONFLICT");
await assert.rejects(loadWorkflowTransitionEntity(adapter, "other", "source", entity, {}), (error) => error.code === "WORKFLOW_SOURCE_SCOPE_MISMATCH");
await assert.rejects(loadWorkflowTransitionEntity(adapter, "tenant", "other", entity, {}), (error) => error.code === "WORKFLOW_SOURCE_SCOPE_MISMATCH");
for (const code of ["INVALID_CONDITION_FIELD", "INVALID_DOMAIN_ACTION", "APPROVAL_TARGET_UNSUPPORTED", "UNCOVERED_TRANSITION_OUTCOME", "INVALID_CONDITION_VALUE"]) {
  assert.notEqual(workflowReadinessMessage(code, "fr"), workflowReadinessMessage(code, "en"));
  assert.ok(!workflowReadinessMessage(code, "en").includes(code));
}
console.log(`WF-01 contracts passed: ${templates.length} real templates, ${entities.length} adapters, 6 canonical approval delegations and 5 canonical finance links, typed branches, post-action revision/tenant checks and FR/EN blockers.`);
