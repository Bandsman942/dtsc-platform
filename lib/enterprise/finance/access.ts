import type { Prisma } from "@prisma/client";
import { getEnterpriseCoreV2Access, type EnterpriseCoreV2Action } from "@/lib/enterprise/core-v2/access";
import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export async function getEnterpriseFinanceAccess({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: "FINANCE_BUDGETS" | "REPORTS" | "VALIDATIONS";
  action: EnterpriseCoreV2Action;
}) {
  if (moduleCode === "VALIDATIONS") return getEnterpriseCoreV2Access({ session, organizationId, moduleCode, action });
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return null;
  if (membership.role === "GUEST" && action !== "read") return null;
  const readable = await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, "read");
  if (!readable) return null;
  const isManager = ENTERPRISE_MANAGER_ROLES.has(membership.role);
  if (!isManager && action !== "read" && !(await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, action))) return null;
  return {
    membership,
    canSeeAll: isManager,
    canManage: isManager,
    canCreate: membership.role !== "GUEST" && (isManager || action === "read" || action === "submit" || await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, "submit")),
  };
}

export function enterpriseBudgetVisibilityWhere({ organizationId, userId, canSeeAll }: { organizationId: string; userId: string; canSeeAll: boolean }): Prisma.EnterpriseBudgetWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { createdByUserId: userId }),
  };
}

export function enterpriseExpenseVisibilityWhere({ organizationId, userId, canSeeAll }: { organizationId: string; userId: string; canSeeAll: boolean }): Prisma.EnterpriseExpenseWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { OR: [{ requestedByUserId: userId }, { createdByUserId: userId }] }),
  };
}

export function enterpriseReportVisibilityWhere({ organizationId, userId, canSeeAll }: { organizationId: string; userId: string; canSeeAll: boolean }): Prisma.EnterpriseReportWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { generatedByUserId: userId }),
  };
}
