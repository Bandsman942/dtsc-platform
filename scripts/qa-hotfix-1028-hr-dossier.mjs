import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function includes(path, tokens) {
  const content = file(path);
  for (const token of tokens) assert.ok(content.includes(token), path + " missing: " + token);
}
includes("prisma/enterprise-hr-payroll.prisma", [
  "model EnterpriseEmploymentContractRevision", "@@unique([organizationId, contractId, revisionNumber], map: \"ECR_contract_revision_uniq\")",
]);
includes("prisma/migrations/20261105201000_hr_contract_revision_history/migration.sql", [
  "CREATE TABLE", "FOREIGN KEY", "ON DELETE RESTRICT",
]);
includes("lib/enterprise/hr-payroll/employees.ts", [
  "updateEnterpriseEmployee", "archiveEnterpriseEmployee", "restoreEnterpriseEmployee",
  "revision: input.revision", "EMPLOYEE_ARCHIVE_DEPENDENCIES", "EMPLOYEE_MANAGER_CYCLE",
]);
includes("lib/enterprise/hr-payroll/contracts.ts", [
  "enterpriseEmploymentContractRevision.create", "revisionNumber: contract.revision",
  "if (updated.count !== 1) throw new EnterpriseDomainConflictError()",
]);
includes("app/api/enterprise/[organizationId]/employees/[employeeId]/route.ts", [
  'action: "manage"', "isSameOriginRequest", "await rateLimit", "employeeUpdateSchema",
  "baseCompensation: access.canAdminister", "organizationId, employeeId",
]);
includes("app/api/enterprise/[organizationId]/employees/[employeeId]/restore/route.ts", [
  'action: "manage"', "restoreEnterpriseEmployee",
]);
includes("app/api/enterprise/[organizationId]/employment-contracts/[contractId]/revisions/route.ts", [
  'action: "manage"', "take: pageSize", "organizationId, contractId",
]);
includes("components/enterprise/professional/enterprise-employee-dossier-dialog.tsx", [
  "<details", "professionalErpMoney", "onChanged", "copyByLocale",
  '"DELETE"', '"PATCH"',
]);
includes("components/enterprise/professional/enterprise-human-resources-workspace.tsx", [
  "contractHistory", "historySelected", "setFocusedEmployeeId", "canViewHistory",
]);
assert.ok(!file("lib/enterprise/hr-payroll/employees.ts").includes("enterpriseEmployee.delete("),
  "Employee data must never be physically deleted");
console.info("Hotfix #1028 HR dossiers/contracts/organization static guards: OK");
