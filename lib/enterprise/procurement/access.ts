import type { Prisma } from "@prisma/client";
import { getEnterpriseCoreV2Access, type EnterpriseCoreV2Action } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export async function getEnterpriseProcurementAccess({
  session,
  organizationId,
  moduleCode,
  action,
}: {
  session: SessionPayload;
  organizationId: string;
  moduleCode: "DOCUMENTS" | "SUPPLIERS_PURCHASES" | "VALIDATIONS";
  action: EnterpriseCoreV2Action;
}) {
  return getEnterpriseCoreV2Access({ session, organizationId, moduleCode, action });
}

async function memberDepartmentId(organizationId: string, userId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE", removedAt: null },
    select: { positionId: true },
  });
  if (!member?.positionId) return null;
  const position = await prisma.enterprisePosition.findFirst({
    where: { id: member.positionId, organizationId, isActive: true },
    select: { departmentId: true },
  });
  return position?.departmentId || null;
}

export async function canAccessEnterpriseDocument({
  organizationId,
  userId,
  canManage,
  documentId,
  forDownload = false,
}: {
  organizationId: string;
  userId: string;
  canManage: boolean;
  documentId: string;
  forDownload?: boolean;
}) {
  const document = await prisma.enterpriseDocument.findFirst({ where: { id: documentId, organizationId, archivedAt: null } });
  if (!document) return null;
  if (canManage || document.createdByUserId === userId || document.ownerUserId === userId) return document;
  if (document.visibility === "ORGANIZATION") return document;
  if (document.visibility === "DEPARTMENT") {
    const departmentId = await memberDepartmentId(organizationId, userId);
    if (departmentId && document.departmentId === departmentId) return document;
    return null;
  }
  if (document.visibility === "RESTRICTED") {
    const access = await prisma.enterpriseDocumentAccess.findFirst({
      where: {
        organizationId,
        documentId,
        userId,
        ...(forDownload ? { accessLevel: { in: ["DOWNLOAD", "EDIT"] } } : {}),
      },
      select: { id: true },
    });
    return access ? document : null;
  }
  return null;
}

export function enterpriseDocumentVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
}): Prisma.EnterpriseDocumentWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll
      ? {}
      : {
          OR: [
            { visibility: "ORGANIZATION" },
            { createdByUserId: userId },
            { ownerUserId: userId },
            { access: { some: { userId } } },
          ],
        }),
  };
}

export function enterprisePurchaseVisibilityWhere({
  organizationId,
  userId,
  canSeeAll,
}: {
  organizationId: string;
  userId: string;
  canSeeAll: boolean;
}): Prisma.EnterprisePurchaseWhereInput {
  return {
    organizationId,
    archivedAt: null,
    ...(canSeeAll ? {} : { OR: [{ requestedByUserId: userId }, { buyerUserId: userId }, { createdByUserId: userId }] }),
  };
}
