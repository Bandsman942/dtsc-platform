import assert from "node:assert/strict";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const { evaluateWorkflowBooleanExpression, workflowBooleanExpressionSchema, workflowVariableMappingsSchema, projectWorkflowVariables } =
  workflowTestLoader({})("@/lib/enterprise/workflows/advanced-data");
const org = "tenant-a";
const entity = {
  id: "entity-a", organizationId: org, status: "APPROVED",
  approved: true, amount: "123456789012345678.90", date: "2026-10-16T08:00:00+02:00",
  note: "approved", confidential: "PRIVATE-DATA",
};
const fields = new Map([
  ["status", "STRING"], ["approved", "BOOLEAN"], ["amount", "NUMBER"],
  ["date", "DATE"], ["note", "STRING"], ["confidential", "STRING"],
]);
let reads = [];
const adapter = {
  entityType: "EnterpriseRequest",
  conditionFields: fields,
  getConditionField: (snapshot, name) => { reads.push(name); return snapshot[name]; },
};
const leaf = (field, operator, value) => ({
  kind: "LEAF", condition: { field, operator, ...(value !== undefined ? { value } : {}) },
});
const and = (...children) => ({ kind: "AND", children });
const or = (...children) => ({ kind: "OR", children });
const expr = and(
  leaf("approved", "EQUALS", true),
  or(leaf("status", "EQUALS", "APPROVED"), leaf("amount", "GREATER_THAN", 100)),
);
assert.equal(evaluateWorkflowBooleanExpression(adapter, entity, expr), true);
assert.equal(evaluateWorkflowBooleanExpression(adapter, entity, and(leaf("approved", "EQUALS", false), leaf("status", "EQUALS", "APPROVED"))), false);
assert.equal(evaluateWorkflowBooleanExpression(adapter, entity, or(leaf("status", "EQUALS", "DRAFT"), leaf("approved", "EQUALS", true))), true);
// A skipped path MUST be preflight-validated, never smuggled through a short circuit.
reads = [];
assert.throws(() => evaluateWorkflowBooleanExpression(adapter, entity,
  or(leaf("approved", "EQUALS", true), leaf("private.sql", "EQUALS", "secret"))), /WORKFLOW_BOOLEAN_INVALID_CONDITION_FIELD/);
assert.deepEqual(reads, [], "An invalid branch must fail before ANY underlying entity read");
assert.throws(() => evaluateWorkflowBooleanExpression(adapter, entity,
  and(leaf("approved", "EQUALS", false), leaf("status", "GREATER_THAN", "A"))), /WORKFLOW_BOOLEAN_INVALID_CONDITION_OPERATOR/);
assert.equal(workflowBooleanExpressionSchema.safeParse({ ...expr, evilScript: "return true" }).success, false);
assert.equal(workflowBooleanExpressionSchema.safeParse({ kind: "NOT", children: [leaf("status", "EQUALS", "APPROVED")] }).success, false);
assert.equal(workflowBooleanExpressionSchema.safeParse(and(leaf("approved", "EQUALS", true))).success, false);
const tooDeep = and(leaf("approved", "EQUALS", true),
  and(leaf("approved", "EQUALS", true),
    and(leaf("approved", "EQUALS", true),
      and(leaf("approved", "EQUALS", true), leaf("approved", "EQUALS", true)))));
assert.equal(workflowBooleanExpressionSchema.safeParse(tooDeep).success, false, "depth bound must fail");
const tooMany = or(...Array.from({ length: 8 }, () =>
  or(leaf("approved", "EQUALS", true), leaf("approved", "EQUALS", false), leaf("status", "EQUALS", "APPROVED"), leaf("note", "EQUALS", "approved"))));
assert.equal(workflowBooleanExpressionSchema.safeParse(tooMany).success, false, "more than 24 leaves must fail");
let pathological = leaf("approved", "EQUALS", true);
for (let i = 0; i < 2_000; i++) pathological = and(pathological, leaf("approved", "EQUALS", false));
assert.equal(workflowBooleanExpressionSchema.safeParse(pathological).success, false, "extremely deep input must fail safely, without recursive stack overflow");

assert.equal(evaluateWorkflowBooleanExpression(adapter, entity, leaf("amount", "GREATER_THAN", 123)), true, "use existing Decimal evaluator, not floating point");
const mapping = [
  { target: "STATUS", sourceField: "status", type: "STRING" },
  { target: "AMOUNT", sourceField: "amount", type: "NUMBER" },
  { target: "APPROVED", sourceField: "approved", type: "BOOLEAN" },
  { target: "DATE", sourceField: "date", type: "DATE" },
];
const allowed = new Set(["status", "amount", "approved", "date"]);
const projected = projectWorkflowVariables(adapter, entity, mapping, { organizationId: org, readableFields: allowed });
assert.deepEqual(Object.assign({}, projected), {
  STATUS: "APPROVED", AMOUNT: "123456789012345678.90", APPROVED: true, DATE: "2026-10-16T06:00:00.000Z",
});
assert.equal(Object.getPrototypeOf(projected), null, "No inherited key injection");
reads = [];
assert.throws(() => projectWorkflowVariables(adapter, { ...entity, organizationId: "tenant-b" }, mapping,
  { organizationId: org, readableFields: allowed }), /TENANT_MISMATCH/);
assert.deepEqual(reads, [], "Cross-tenant projection must reject before any field read");

assert.equal(JSON.stringify(entity).includes("PRIVATE-DATA"), true);
assert.equal(JSON.stringify(projected).includes("PRIVATE-DATA"), false, "No undeclared field leakage");
reads = [];
assert.throws(() => projectWorkflowVariables(adapter, entity,
  [{ target: "SECRET", sourceField: "confidential", type: "STRING" }], { organizationId: org, readableFields: allowed }), /PERMISSION_DENIED/);
assert.deepEqual(reads, [], "No getConditionField call on unauthorized source");
assert.throws(() => projectWorkflowVariables(adapter, entity,
  [{ target: "WRONG", sourceField: "status", type: "NUMBER" }], { organizationId: org, readableFields: allowed }), /FIELD_INVALID/);
assert.equal(workflowVariableMappingsSchema.safeParse([...mapping, mapping[0]]).success, false, "Duplicate target rejected");
assert.equal(workflowVariableMappingsSchema.safeParse([{ target: "__proto__", sourceField: "status", type: "STRING" }]).success, false);
assert.equal(workflowVariableMappingsSchema.safeParse([{ target: "SYS_ADMIN", sourceField: "status", type: "STRING" }]).success, false);
assert.equal(workflowVariableMappingsSchema.safeParse([{ target: "ANY", sourceField: "status", type: "STRING", transformer: "eval" }]).success, false);
assert.equal(workflowVariableMappingsSchema.safeParse(Array.from({ length: 17 }, (_, i) => ({ target: "T" + i, sourceField: "status", type: "STRING" }))).success, false);
assert.throws(() => projectWorkflowVariables(adapter, { ...entity, status: { raw: "object" } }, [mapping[0]], { organizationId: org, readableFields: allowed }), /VALUE_INVALID/);
assert.throws(() => projectWorkflowVariables(adapter, { ...entity, status: "x".repeat(300) }, [mapping[0]], { organizationId: org, readableFields: allowed }), /VALUE_INVALID/);
console.log("PASS WF-06B: strict bounded AND/OR, preflight all branches, Decimal reuse, independent source permissions and typed variable mapping.");
