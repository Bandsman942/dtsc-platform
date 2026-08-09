import type { Prisma } from "@prisma/client";
import { resolveEnterpriseModuleCapabilities, type EnterpriseModuleAction } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import type { SessionPayload } from "@/lib/session";

export type EnterpriseCoreV2Action = "read" | "submit" | "write" | "manage";

function capabilityAllowsAction(
  capabilities: Awaited<ReturnType<typeof resolveEnterpriseModuleCapabilities>>,
  action: EnterpriseModuleAction,
) {
  if (action === "read") return capabilities.canRead;
  if (action === "submit") return capabilities.canSubmit;
  if (action === "write") return capabilities.canWrite;
  if (action === "approve") return capabilities.canApprove;
  return capabilities.canManage;
}

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
  const capabilities = await resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode });
  if (!capabilityAllowsAction(capabilities, action)) return null;
  return {
    membership,
    capabilities,
    canSeeAll: capabilities.canApprove || capabilities.canManage,
    canManage: capabilities.canManage,
    canCreate: capabilities.canCreate,
    canWrite: capabilities.canWrite,
    canApprove: capabilities.canApprove,
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
