import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const hr = read("components/enterprise/professional/enterprise-human-resources-workspace.tsx");
const lookups = read("app/api/enterprise/[organizationId]/hr-payroll-lookups/route.ts");
const departments = read("components/enterprise/enterprise-administration-panels-base.tsx");
const positions = read("components/enterprise/enterprise-positions-guided-panel.tsx");
const canonicalDepartment = read("app/api/enterprise/[organizationId]/administration/departments/[departmentId]/route.ts");
const canonicalPosition = read("app/api/enterprise/[organizationId]/administration/positions-guided/route.ts");

for (const token of [
  "EnterpriseAdministrationDepartmentsPanel",
  "EnterprisePositionsGuidedPanel",
  "canManageOrganization",
  "reloadOnSave={false}",
  "allowPermissionsEdit={false}",
  "organizationRefresh",
  "getEnterpriseModuleDefinition",
  "setFocusedEmployeeId(employee.id)",
  "grid-cols-[minmax(0,1fr)]",
  "dark:text-indigo-300",
]) {
  assert.ok(hr.includes(token), `RH organization workspace missing: ${token}`);
}
assert.ok(hr.includes('if (tab !== "ORG" || !lookups.canManageOrganization)'), "Admin data must load only for eligible users in organization tab.");
assert.ok(hr.includes("professionalRequest<OrganizationAdminData>"), "Organization must use the canonical guarded administration route.");
assert.ok(!hr.includes("fetch(`/api/enterprise/${organizationId}/administration/positions-guided`"), "HR must not duplicate position mutations.");
assert.ok(lookups.includes('moduleCode: "ADMIN_DASHBOARD", action: "manage"'), "Administration permission gate must remain distinct from HR manage.");
assert.ok(lookups.includes("canManageOrganization: false"), "Personal read must never expose administration CRUD.");
assert.ok(lookups.includes('headers: { "Cache-Control": "private, no-store" }'), "HR selector responses must not be cached publicly.");
assert.ok(departments.includes("onSaved?: () => void") && departments.includes("onSaved?.();"), "Department panel must notify HR without a duplicate CRUD.");
assert.ok(positions.includes("reloadOnSave = true") && positions.includes("if (reloadOnSave) window.location.reload()"), "Existing admin behavior must remain intact while HR avoids full reload.");
assert.ok(canonicalDepartment.includes('moduleCode: "ADMIN_DASHBOARD"') && canonicalDepartment.includes("isActive: false"), "Department deactivation must remain canonical and non-destructive.");
assert.ok(canonicalPosition.includes("requireEnterpriseGovernanceAccess") && canonicalPosition.includes("permissionsJson"), "Official position capabilities must remain server controlled.");
assert.ok(canonicalPosition.includes("data.preservePermissions ? {} : { permissionsJson"), "HR position metadata updates must preserve role permissions.");
assert.ok(positions.includes("preservePermissions: !allowPermissionsEdit"), "HR positions must use the safe metadata-only mutation mode.");
assert.ok(!hr.includes("prisma."), "No direct client-side database mutation.");

console.log("Hotfix #1034 organization canonical CRUD QA: OK");
