import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { enterpriseApprovalModuleForTarget, enterpriseApprovalTargetDeepLink } from "@/lib/enterprise/approval-targets";
import { enterpriseApprovalVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";

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

  const [versions, decisions, comments] = await Promise.all([
    prisma.enterpriseApprovalSubmissionVersion.findMany({ where: { organizationId, approvalId: id }, orderBy: { versionNumber: "desc" }, take: 100 }),
    prisma.enterpriseApprovalDecision.findMany({ where: { organizationId, approvalId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterpriseApproval", entityId: id, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);

  const moduleCode = enterpriseApprovalModuleForTarget(approval.targetEntityType);
  const candidateResult = moduleCode && approval.status === "PENDING"
    ? await listEnterpriseApprovalCandidates({ organizationId, requesterUserId: approval.requestedByUserId, moduleCode })
    : { candidates: [], selfApprovalOverrideAvailable: false };
  const delegates = candidateResult.candidates.filter((candidate) => candidate.userId !== approval.approverUserId);
  const isAssignedValidator = approval.approverUserId === session.userId;
  const isRequester = approval.requestedByUserId === session.userId;
  const selfApprovalAllowed = candidateResult.candidates.some((candidate) => candidate.userId === session.userId && candidate.selfApprovalOverride);
  const canDecide = approval.status === "PENDING" && isAssignedValidator && (!isRequester || selfApprovalAllowed);
  const capabilities = {
    canView: true,
    canComment: true,
    canApprove: canDecide,
    canReject: canDecide,
    canRequestCorrection: canDecide,
    canDelegate: approval.status === "PENDING" && Boolean(moduleCode) && delegates.length > 0 && (access.canManage || isAssignedValidator),
    canResubmit: approval.status === "CORRECTION_REQUESTED" && (access.canManage || isRequester),
  };

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, approvalId: id, domain: "approval-coordination", moduleCode } });
  return NextResponse.json({
    approval,
    versions,
    decisions,
    comments,
    delegates: delegates.map((candidate) => ({ id: candidate.userId, label: candidate.positionTitle ? `${candidate.name} · ${candidate.positionTitle}` : candidate.name, email: candidate.email })),
    sourceDeepLink: enterpriseApprovalTargetDeepLink(approval.targetEntityType, approval.targetEntityId, approval.id),
    capabilities,
  });
}
