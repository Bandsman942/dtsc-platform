import type { SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { getActiveEnterpriseModuleRestriction } from "@/lib/enterprise/module-access-restrictions";

// The employee record is deliberately NOT inferred from email, phone or display name.
// HR must explicitly link it to the active organization membership.
export async function getActiveEnterpriseSelfEmployee(session: SessionPayload, organizationId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null },
    select: { id: true },
  });
  if (!member) return null;
  return prisma.enterpriseEmployee.findFirst({
    where: { organizationId, organizationMemberId: member.id, archivedAt: null, employmentStatus: "ACTIVE" },
    select: { id: true, employeeNumber: true, displayName: true, organizationId: true },
  });
}

/**
 * A strictly object-scoped SELF permission. A member without enterprise.payroll.view
 * may read their own APPROVED payslip, but can never obtain the company payroll list.
 * Entitlement, active module, dependencies, restrictions and tenant are still required.
 */
export async function hasEnterpriseSelfHrModule(session: SessionPayload, organizationId: string, moduleCode: "PAYROLL_OPERATIONS" | "TIME_ATTENDANCE") {
  const [membership, entitlements] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: { userId: session.userId, organizationId, status: "ACTIVE", removedAt: null },
      select: { organization: { select: { status: true, deletedAt: true, organizationType: true, settingsJson: true } } },
    }),
    getOrganizationEntitlements(organizationId),
  ]);
  if (!membership || membership.organization.status !== "ACTIVE" || membership.organization.deletedAt || membership.organization.organizationType !== "CLIENT") return false;
  if (!entitlements || entitlements.organizationStatus !== "ACTIVE" || entitlements.organizationType !== "CLIENT") return false;
  if (getActiveEnterpriseModuleRestriction(membership.organization.settingsJson, session.userId, moduleCode)) return false;
  const entitledModule = entitlements.modules.find((candidate) => candidate.canonicalCode === moduleCode && candidate.isEnabled && candidate.allowed);
  if (!entitledModule) return false;
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition) return false;
  for (const dependency of definition.dependencies) {
    if (!entitlements.modules.some((candidate) => candidate.canonicalCode === normalizeEnterpriseModuleCode(dependency) && candidate.isEnabled && candidate.allowed)) return false;
  }
  return true;
}
