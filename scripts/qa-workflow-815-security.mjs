import assert from "node:assert/strict";
import fs from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const org = "tenant-a";
let member = {
  role: "MANAGER", positionId: "position-1", positionCode: null,
  organizationRoleAssignments: [],
};
let enabled = true;
let membershipActive = true;
let positionPermissions = [];
const requested = [];
const prisma = {
  organizationMember: {
    findFirst: async ({ where }) => {
      requested.push(where);
      assert.equal(where.organizationId, org);
      assert.equal(where.status, "ACTIVE");
      assert.equal(where.removedAt, null);
      return membershipActive ? member : null;
    },
  },
  enterprisePosition: { findFirst: async () => ({ permissionsJson: positionPermissions }) },
  enterpriseWorkflowDefinition: { findFirst: async () => ({ triggerEntityType: "EnterpriseTask" }) },
};
const moduleAccess = {
  resolveEnterpriseModuleAccess: async ({ organizationId, moduleCode, action }) => {
    assert.equal(organizationId, org);
    requested.push({ moduleCode, action });
    return { allowed: enabled, code: enabled ? "OK" : "ENTITLEMENT_DENIED" };
  },
  listNavigableEnterpriseModules: async ({ userId, organizationId, action }) => {
    assert.equal(organizationId, org); assert.equal(action, "read");
    return enabled ? [{ canonicalCode: "TASKS_OPERATIONS" }] : [];
  },
};
const loader = workflowTestLoader({
  "@/lib/prisma": { prisma },
  "@/lib/enterprise-sector-templates": { ENTERPRISE_ADMIN_ROLES: new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]) },
  "@/lib/enterprise/module-access": moduleAccess,
  "@/lib/enterprise/workflows/runtime-utils": { workflowSourceModule: (entity) => entity === "EnterpriseTask" ? "TASKS_OPERATIONS" : "FINANCE_PAYMENTS" },
});
const { getEnterpriseWorkflowAccess } = loader("@/lib/enterprise/workflows/access");
const { requireWorkflowSourceAccess, requireWorkflowDefinitionSourceAccess, listReadableWorkflowEntityTypes } = loader("@/lib/enterprise/workflows/source-access");
const session = { userId: "member-a", activeContext: "ORGANIZATION", activeOrganizationId: org };
assert.equal(await getEnterpriseWorkflowAccess({ ...session, activeOrganizationId: "tenant-b" }, org), null, "Cross-tenant context must fail");
assert.equal(await getEnterpriseWorkflowAccess({ ...session, activeContext: "DTSC_INTERNAL" }, org), null, "DTSC global context must fail");
assert.equal((await getEnterpriseWorkflowAccess(session, org)).canStartManual, false, "MANAGER is not implicit workflow manager");
assert.equal((await getEnterpriseWorkflowAccess(session, org)).canViewAllRuns, false, "MANAGER cannot read everyone's runs");
positionPermissions = ["enterprise.workflows.start", "enterprise.workflows.view_runs"];
assert.equal((await getEnterpriseWorkflowAccess(session, org)).canStartManual, true, "Active position grants start");
assert.equal((await getEnterpriseWorkflowAccess(session, org)).canViewAllRuns, true, "Explicit grants allow metrics");
positionPermissions = [];
member.organizationRoleAssignments = [{ role: { permissionsJson: { permissions: ["enterprise.workflows.publish"] } } }];
assert.equal((await getEnterpriseWorkflowAccess(session, org)).canPublish, true, "Active assigned role grants publish");
member.organizationRoleAssignments = [];
member.role = "OWNER";
assert.equal((await getEnterpriseWorkflowAccess(session, org)).canCancel, true, "Client owner grants mutation");
enabled = false;
assert.equal(await getEnterpriseWorkflowAccess(session, org), null, "Even OWNER cannot bypass disabled module entitlement");
await assert.rejects(requireWorkflowSourceAccess({ organizationId: org, userId: "member-a", sourceEntityType: "EnterpriseTask" }), (error) => error.code === "WORKFLOW_SOURCE_MODULE_ACCESS_DENIED");
enabled = true;
membershipActive = false;
assert.equal(await getEnterpriseWorkflowAccess(session, org), null, "Membership removal takes effect immediately");
membershipActive = true;
await requireWorkflowSourceAccess({ organizationId: org, userId: "member-a", sourceEntityType: "EnterpriseTask", action: "submit" });
await requireWorkflowDefinitionSourceAccess({ organizationId: org, userId: "member-a", definitionId: "definition-1" });
assert.deepEqual(await listReadableWorkflowEntityTypes("member-a", org), ["EnterpriseTask"]);
for (const path of [
  "app/api/enterprise/[organizationId]/workflow-runs/route.ts",
  "app/api/enterprise/[organizationId]/workflow-runs/[id]/route.ts",
]) {
  const content = fs.readFileSync(path, "utf8");
  assert.ok(content.includes("listReadableWorkflowEntityTypes"), `${path} must filter module visibility`);
}
const listing = fs.readFileSync("app/api/enterprise/[organizationId]/workflow-runs/route.ts", "utf8");
assert.match(listing, /groupBy\(\{ by: \["status"\], where,/, "Metrics must reuse the scoped run predicate");
const detail = fs.readFileSync("app/api/enterprise/[organizationId]/workflow-runs/[id]/route.ts", "utf8");
assert.ok(detail.includes("events: [], stepRuns: run.stepRuns.filter"), "Assignee must not read all decisions and history");
const runtime = fs.readFileSync("lib/enterprise/workflows/runtime-utils.ts", "utf8");
assert.ok(runtime.includes("const candidates = startedByUserId") && runtime.includes("WORKFLOW_EXECUTION_MANDATE_REVOKED"), "Revoked starter must not fall back to another actor");
for (const path of [
 "app/api/enterprise/[organizationId]/workflow-runs/start/route.ts",
 "app/api/enterprise/[organizationId]/workflow-runs/[id]/retry/route.ts",
 "app/api/enterprise/[organizationId]/workflow-runs/[id]/cancel/route.ts",
]) assert.ok(fs.readFileSync(path, "utf8").includes("requireWorkflowSourceAccess"), `${path} must protect source module`);
console.log("PASS WF-02: active tenant + canonical entitlement + explicit RBAC + scoped reads + revoked mandate + mutation entrypoints.");
