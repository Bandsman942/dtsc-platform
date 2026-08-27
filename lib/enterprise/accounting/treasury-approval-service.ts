import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canUseSelfApprovalOverride } from "@/lib/enterprise/approval-assignment";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { publishFinanceEvent } from "@/lib/enterprise/accounting/helpers";

export async function approveAssignedAccountTransfer(
  organizationId: string,
  transferId: string,
  actorUserId: string,
  revision: number,
) {
  const pendingApproval = await prisma.enterpriseApproval.findFirst({
    where: {
      organizationId,
      targetEntityType: "EnterpriseAccountTransfer",
      targetEntityId: transferId,
      status: "PENDING",
      archivedAt: null,
    },
    select: { id: true, approverUserId: true, requestedByUserId: true, revision: true },
  });
  if (!pendingApproval) throw new EnterpriseAccountingError("TRANSFER_APPROVAL_NOT_ASSIGNED", 409);
  if (pendingApproval.approverUserId !== actorUserId) throw new EnterpriseAccountingError("TRANSFER_APPROVER_NOT_ALLOWED", 403);

  let selfApprovalAllowed = false;
  if (pendingApproval.requestedByUserId === actorUserId) {
    selfApprovalAllowed = await canUseSelfApprovalOverride({ organizationId, userId: actorUserId, moduleCode: "FINANCE_TREASURY" });
    if (!selfApprovalAllowed) throw new EnterpriseAccountingError("TRANSFER_SELF_APPROVAL_FORBIDDEN", 403);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "EnterpriseAccountTransfer" WHERE id = ${transferId} AND "organizationId" = ${organizationId} FOR UPDATE`);
    const transfer = await tx.enterpriseAccountTransfer.findFirst({ where: { id: transferId, organizationId } });
    if (!transfer) throw new EnterpriseAccountingError("TRANSFER_NOT_FOUND", 404);
    if (transfer.status !== "DRAFT" || transfer.revision !== revision) throw new EnterpriseAccountingError("TRANSFER_CONFLICT", 409);

    const approval = await tx.enterpriseApproval.findFirst({
      where: { id: pendingApproval.id, organizationId, targetEntityType: "EnterpriseAccountTransfer", targetEntityId: transferId, status: "PENDING", archivedAt: null },
    });
    if (!approval || approval.approverUserId !== actorUserId) throw new EnterpriseAccountingError("TRANSFER_APPROVAL_CONFLICT", 409);
    if (approval.requestedByUserId === actorUserId && !selfApprovalAllowed) throw new EnterpriseAccountingError("TRANSFER_SELF_APPROVAL_FORBIDDEN", 403);

    const updated = await tx.enterpriseAccountTransfer.update({
      where: { id: transfer.id },
      data: { status: "APPROVED", approvedByUserId: actorUserId, revision: { increment: 1 } },
    });
    const decided = await tx.enterpriseApproval.updateMany({
      where: { id: approval.id, organizationId, status: "PENDING", revision: approval.revision, archivedAt: null },
      data: { status: "APPROVED", decidedAt: new Date(), decisionComment: selfApprovalAllowed ? "SELF_APPROVAL_OVERRIDE" : null, revision: { increment: 1 } },
    });
    if (decided.count !== 1) throw new EnterpriseAccountingError("TRANSFER_APPROVAL_CONFLICT", 409);

    await publishFinanceEvent(tx, {
      organizationId,
      entityType: "EnterpriseAccountTransfer",
      entityId: transfer.id,
      eventType: "ACCOUNT_TRANSFER_APPROVED",
      summary: `Transfer ${transfer.number} approved`,
      actorUserId,
      fromStatus: "DRAFT",
      toStatus: "APPROVED",
      metadataJson: { approvalId: approval.id, selfApprovalOverride: selfApprovalAllowed },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
