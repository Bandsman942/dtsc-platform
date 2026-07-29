import type { Prisma } from "@prisma/client";
import { canAccessEnterpriseModule, ENTERPRISE_MANAGER_ROLES, requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export type EnterpriseCoreV2Action = "read" | "submit" | "write" | "manage";

export async function getEnterpriseCoreV2Access({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: string;
  action: EnterpriseCoreV2Action;
}) {
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) return null;
  if (membership.role === "GUEST" && action !== "read") return null;
  const allowed = await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, action);
  if (!allowed) return null;
  return {
    membership,
    canSeeAll: ENTERPRISE_MANAGER_ROLES.has(membership.role),
    canManage: ENTERPRISE_MANAGER_ROLES.has(membership.role),
    canCreate: membership.role !== "GUEST",
  };
}

export function enterpriseTaskVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
}): Prisma.EnterpriseTaskWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { OR: [{ createdByUserId: userId }, { assignedToUserId: userId }] }),
  };
}

export function enterpriseRequestVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
}): Prisma.EnterpriseRequestWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }] }),
  };
}

export function enterpriseApprovalVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
}): Prisma.EnterpriseApprovalWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { OR: [{ requestedByUserId: userId }, { approverUserId: userId }] }),
  };
}

export function enterpriseMeetingVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
}): Prisma.EnterpriseMeetingWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { OR: [{ organizerUserId: userId }, { participants: { some: { userId } } }] }),
  };
}

export function canMutateOwnedObject({
  canManage,
  userId,
  relatedUserIds,
}: {
  canManage: boolean;
  userId: string;
  relatedUserIds: Array<string | null | undefined>;
}) {
  return canManage || relatedUserIds.some((candidate) => candidate === userId);
}
