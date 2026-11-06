import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function expect(path, tokens) {
  const source = file(path);
  for (const token of tokens) assert.ok(source.includes(token), `${path} must include ${token}`);
}
expect("lib/enterprise/hr-payroll/contracts.ts", [
  "archiveEnterpriseEmploymentContract", "restoreEnterpriseEmploymentContract",
  'status === "ACTIVE"', "EnterpriseDomainConflictError",
  'targetEntityType: "EnterpriseEmploymentContract"', 'status: "SUPERSEDED"',
  "archivedAt: now", "archivedAt: null",
  "EMPLOYMENT_CONTRACT_ARCHIVED", "EMPLOYMENT_CONTRACT_RESTORED",
  'contract.status === "PENDING_APPROVAL" ? "DRAFT"',
]);
expect("app/api/enterprise/[organizationId]/employment-contracts/[contractId]/route.ts", [
  "export async function DELETE", "isSameOriginRequest", "rateLimit",
  'moduleCode: "HUMAN_RESOURCES", action: "manage"',
  "archiveSchema", "archiveEnterpriseEmploymentContract", "writeAuditLog",
]);
expect("app/api/enterprise/[organizationId]/employment-contracts/[contractId]/restore/route.ts", [
  "export async function POST", "isSameOriginRequest", "rateLimit",
  'moduleCode: "HUMAN_RESOURCES", action: "manage"',
  "restoreEnterpriseEmploymentContract", "writeAuditLog",
]);
expect("app/api/enterprise/[organizationId]/employment-contracts/route.ts", [
  'url.searchParams.get("archived") === "1"', "if (archived && !managerAccess)",
  "archivedAt: archived ? { not: null } : null", "canArchive:", "canRestore:",
]);
expect("components/enterprise/professional/enterprise-human-resources-workspace.tsx", [
  "archivedView", "changeContractArchive", '"ARCHIVE" | "RESTORE"',
  'mode === "ARCHIVE" ? "DELETE" : "POST"', "professionalMutation",
  "Archive contract", "Restaurer le contrat", "dark:",
]);
assert.ok(!file("lib/enterprise/hr-payroll/contracts.ts").includes("enterpriseEmploymentContract.delete("),
  "Contracts must be soft-archived, never physically deleted");
assert.ok(!file("lib/enterprise/hr-payroll/contracts.ts").includes("enterpriseEmploymentContract.deleteMany("),
  "Contract history must be preserved");
console.info("Hotfix #1028 contract archive/restore QA: OK");
