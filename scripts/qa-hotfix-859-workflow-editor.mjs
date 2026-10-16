import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(path, "utf8");
const ui = read("components/enterprise/core-v2/enterprise-workflows-workspace.tsx");
const studio = read("components/enterprise/core-v2/workflow-visual-studio.tsx");
const api = read("app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/route.ts");
const members = read("app/api/enterprise/[organizationId]/workflows/[id]/assignees/route.ts");
const sources = read("app/api/enterprise/[organizationId]/workflow-runs/sources/route.ts");
const resolver = read("lib/enterprise/workflows/adapters/index.ts");
const approval = read("lib/enterprise/workflows/steps/create-approval.ts");
const i18n = read("lib/enterprise/workflows/recovery-messages.ts");
const migration = read("prisma/migrations/20261016223500_workflow_schedule_inert_execution_receipts/migration.sql");
for (const [value, needle] of [
 [ui,"workflowVersionSchema.safeParse(payload)"],
 [ui,"getWorkflowValidationFieldMessage"],
 [ui,"startEmptyReason"],
 [ui,"startCreateHref"],
 [ui,"assignmentOptions.roles.map"],
 [ui,"name=\"role\""],
 [studio,"Affectation (formulaire guidé)"],
 [studio,"assignmentMembers.map"],
 [studio,"assignmentRoles.map"],
 [studio,"assignmentDepartments.map"],
 [studio,"Advanced configuration (JSON)"],
 [api,"issues: parsed.error.issues.slice"],
 [members,"getEnterpriseWorkflowAccess(session, organizationId)"],
 [members,"requireWorkflowDefinitionSourceAccess"],
 [members,"action: \"approve\""],
 [members,"organizationRoleAssignments"],
 [resolver,"requiredApprovalModuleCode"],
 [resolver,"positionCode: role"],
 [resolver,"WORKFLOW_APPROVER_MODULE_DENIED"],
 [approval,"workflowSourceModule(run.sourceEntityType)"],
 [approval,"WORKFLOW_SELF_APPROVAL_BLOCKED"],
 [approval,"WORKFLOW_APPROVAL_CONFLICT"],
 [sources,"NO_VISIBLE_RECORDS"],
 [sources,"enterprise-modules/FINANCE_BUDGETS"],
 [i18n,"WORKFLOW_APPROVER_MODULE_DENIED"],
 [i18n,"INVALID_WORKFLOW_VERSION_PAYLOAD"],
 [migration,"EW_Occurrence_inert_execution_check"]
]) assert.ok(value.includes(needle), "Missing #859 invariant: "+needle);
assert.ok(approval.includes('assignment.strategy === "DEPARTMENT_MANAGER" && !assignment.departmentId'), "fallback only for an unconfigured template manager");
assert.ok(approval.includes("mandate.allowed"), "a pre-existing ERP approver must keep approve rights");
assert.ok(approval.includes("existingPending.approverUserId"), "retain canonical ERP approver");
assert.ok(sources.includes('status: { in: ["DRAFT", "PENDING_APPROVAL"] }'), "expense states must be approvable");
assert.ok(sources.includes('"PREPARING", "CORRECTION_REQUESTED", "PENDING_APPROVAL"'), "budget states must be approvable");
assert.ok(!api.includes("message: parsed.error.issues[0]?.message"),"Do not return raw Zod English errors");
assert.ok(!ui.includes("<Input name=\"role\""),"Use guided role selection");
assert.ok(!members.includes("email: member.user.email"),"Do not expose unrelated member email");
console.log("PASS #859: structured templates, approver RBAC, localized errors, expense empty states, unchanged scheduled guard");
