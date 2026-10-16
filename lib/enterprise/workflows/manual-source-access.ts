import { prisma } from "@/lib/prisma";

/** Fail closed for manual launches that do not match a tenant-scoped, actor-visible ERP source. */
export async function isWorkflowManualSourceSelectable({
  organizationId, userId, entityType, entityId, allowAll,
}: { organizationId: string; userId: string; entityType: string; entityId: string; allowAll: boolean }) {
  const own = !allowAll;
  switch (entityType) {
    case "EnterpriseTask":
      return Boolean(await prisma.enterpriseTask.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { OR: [{ createdByUserId: userId }, { assignedToUserId: userId }] } : {}) }, select: { id: true } }));
    case "EnterpriseRequest":
      return Boolean(await prisma.enterpriseRequest.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }] } : {}) }, select: { id: true } }));
    case "EnterpriseMeeting":
      return Boolean(await prisma.enterpriseMeeting.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { organizerUserId: userId } : {}) }, select: { id: true } }));
    case "EnterprisePurchase":
      return Boolean(await prisma.enterprisePurchase.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { buyerUserId: userId }, { createdByUserId: userId }] } : {}) }, select: { id: true } }));
    case "EnterpriseBudget":
      return Boolean(await prisma.enterpriseBudget.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { OR: [{ ownerUserId: userId }, { createdByUserId: userId }] } : {}) }, select: { id: true } }));
    case "EnterpriseExpense":
      return Boolean(await prisma.enterpriseExpense.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { OR: [{ requestedByUserId: userId }, { createdByUserId: userId }] } : {}) }, select: { id: true } }));
    case "EnterpriseReport":
      return Boolean(await prisma.enterpriseReport.findFirst({ where: { id: entityId, organizationId, archivedAt: null, ...(own ? { generatedByUserId: userId } : {}) }, select: { id: true } }));
    default:
      return false;
  }
}
