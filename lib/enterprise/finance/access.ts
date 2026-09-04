import type { Prisma } from "@prisma/client";
import { getEnterpriseCoreV2Access, type EnterpriseCoreV2Action } from "@/lib/enterprise/core-v2/access";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
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
  const capabilities = await resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode });
  const actionAllowed = action === "read"
    ? capabilities.canRead
    : action === "submit"
      ? capabilities.canSubmit
      : action === "write"
        ? capabilities.canWrite
        : action === "approve"
          ? capabilities.canApprove
          : capabilities.canManage;
  if (!actionAllowed) return null;
  return {
    membership,
    capabilities,
    canSeeAll: capabilities.canApprove || capabilities.canManage,
    canManage: capabilities.canManage,
    canCreate: capabilities.canCreate,
    canWrite: capabilities.canWrite,
    canSubmit: capabilities.canSubmit,
    canApprove: capabilities.canApprove,
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
