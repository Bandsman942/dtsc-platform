import { prisma } from "@/lib/prisma";

const AUDIT_EXPORT_APPROVAL_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// An audit export is approved through the canonical request/approval engine.
// The historic "AuditExport" target was not a supported approval target and
// made a security policy impossible to satisfy through the application.
export async function hasApprovedEnterpriseAuditExport({ organizationId, actorUserId, approvalId }: {
  organizationId: string;
  actorUserId: string;
  approvalId: string | null | undefined;
}) {
  if (!approvalId) return false;
  const approval = await prisma.enterpriseApproval.findFirst({
    where: {
      id: approvalId,
      organizationId,
      targetEntityType: "EnterpriseRequest",
      requestedByUserId: actorUserId,
      status: "APPROVED",
      archivedAt: null,
    },
    select: { targetEntityId: true, requestedAt: true },
  });
  if (!approval || Date.now() - approval.requestedAt.getTime() > AUDIT_EXPORT_APPROVAL_MAX_AGE_MS) return false;
  const request = await prisma.enterpriseRequest.findFirst({
    where: {
      id: approval.targetEntityId,
      organizationId,
      requestType: "AUDIT_EXPORT",
      requestedByUserId: actorUserId,
      archivedAt: null,
    },
    select: { id: true },
  });
  return Boolean(request);
}
