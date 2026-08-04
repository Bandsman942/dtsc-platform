import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enterpriseApprovalVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "read" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const approval = await prisma.enterpriseApproval.findFirst({
    where: { id, ...enterpriseApprovalVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll }) },
  });
  if (!approval) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [versions, decisions, comments, members] = await Promise.all([
    prisma.enterpriseApprovalSubmissionVersion.findMany({ where: { organizationId, approvalId: id }, orderBy: { versionNumber: "desc" }, take: 100 }),
    prisma.enterpriseApprovalDecision.findMany({ where: { organizationId, approvalId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterpriseApproval", entityId: id, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 300 }),
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", removedAt: null, userId: { not: approval.requestedByUserId } }, select: { userId: true, role: true, user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } }, take: 300 }),
  ]);

  const isAssignedValidator = approval.approverUserId === session.userId;
  const isRequester = approval.requestedByUserId === session.userId;
  const canDecide = approval.status === "PENDING" && (access.canManage || isAssignedValidator) && (access.canManage || !isRequester);
  const capabilities = {
    canView: true,
    canComment: true,
    canApprove: canDecide,
    canReject: canDecide,
    canRequestCorrection: canDecide,
    canDelegate: approval.status === "PENDING" && (access.canManage || isAssignedValidator),
    canResubmit: approval.status === "CORRECTION_REQUESTED" && (access.canManage || isRequester),
  };

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, approvalId: id, domain: "approval-coordination" } });
  return NextResponse.json({
    approval,
    versions,
    decisions,
    comments,
    delegates: members.map((member) => ({ id: member.userId, label: `${member.user.name} · ${member.role}`, email: member.user.email })),
    sourceDeepLink: approvalSourceDeepLink(approval.targetEntityType, approval.targetEntityId),
    capabilities,
  });
}

function approvalSourceDeepLink(entityType: string, entityId: string) {
  if (entityType === "EnterpriseTask") return workCoordinationDeepLink("TASK", entityId);
  if (entityType === "EnterpriseRequest") return workCoordinationDeepLink("REQUEST", entityId);
  if (entityType === "EnterpriseMeeting") return workCoordinationDeepLink("MEETING", entityId);
  if (entityType === "EnterprisePurchase") return `/enterprise-modules/SUPPLIERS_PURCHASES?purchase=${encodeURIComponent(entityId)}`;
  if (entityType === "EnterpriseBudget" || entityType === "EnterpriseExpense") return `/enterprise-modules/FINANCE_BUDGETS?object=${encodeURIComponent(entityId)}`;
  return `/enterprise-modules/QUALITY_PHARMACOVIGILANCE?incident=${encodeURIComponent(entityId)}`;
}
