import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { enterpriseApprovalModuleForTarget, enterpriseApprovalTargetDeepLink } from "@/lib/enterprise/approval-targets";
import { enterpriseApprovalVisibilityWhere, getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { prisma } from "@/lib/prisma";
import { requireLotReclassificationOrganizationWideScope } from "@/lib/enterprise/inventory/lot-reclassification";
import { assertSupplierReturnReviewAccess, SUPPLIER_RETURN_TARGET } from "@/lib/enterprise/inventory/supplier-return-request-service";
import { assertRecoveryReviewAccess, RECOVERY_ASSESSMENT_TARGET } from "@/lib/enterprise/inventory/custody-recovery-assessment";
import { supportsProfessionalApprovalCorrection } from "@/lib/standard-work-coordination/approval-coordination";

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
  if (approval.targetEntityType === RECOVERY_ASSESSMENT_TARGET) {
    try { await assertRecoveryReviewAccess(organizationId,session.userId,approval); } catch { return NextResponse.json({error:"FORBIDDEN"},{status:403}); }
  }
  if (approval.targetEntityType === SUPPLIER_RETURN_TARGET) {
    try { await assertSupplierReturnReviewAccess(organizationId, session.userId, approval); }
    catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  }
  if (approval.targetEntityType === "EnterpriseStockLotReclassification") {
    try { await requireLotReclassificationOrganizationWideScope(prisma, organizationId, session.userId); }
    catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  }

  const supplierReturn = approval.targetEntityType === SUPPLIER_RETURN_TARGET
    ? await prisma.enterpriseSupplierReturnRequest.findFirst({ where: { organizationId, id: approval.targetEntityId }, select: { purchaseId: true, sourceMovementId: true, status:true, cancelledAfterApprovalAt:true, cancellationReason:true } })
    : null;
  if (approval.targetEntityType === SUPPLIER_RETURN_TARGET && !supplierReturn) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const [versions, decisions, comments] = await Promise.all([
    prisma.enterpriseApprovalSubmissionVersion.findMany({ where: { organizationId, approvalId: id }, orderBy: { versionNumber: "desc" }, take: 100 }),
    prisma.enterpriseApprovalDecision.findMany({ where: { organizationId, approvalId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.enterpriseOperationalComment.findMany({ where: { organizationId, entityType: "EnterpriseApproval", entityId: id, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);

  const moduleCode = enterpriseApprovalModuleForTarget(approval.targetEntityType);
  const recoveryAssessment=approval.targetEntityType===RECOVERY_ASSESSMENT_TARGET?await prisma.enterpriseInventoryReturnRecoveryAssessment.findFirst({where:{organizationId,id:approval.targetEntityId},select:{custodyId:true,status:true,custody:{select:{status:true,revision:true}},custodyRevision:true,withdrawnAt:true,withdrawalReason:true}}):null;
  if(approval.targetEntityType===RECOVERY_ASSESSMENT_TARGET&&!recoveryAssessment)return NextResponse.json({error:"NOT_FOUND"},{status:404});
  const candidateResult = moduleCode && approval.status === "PENDING" && approval.targetEntityType !== SUPPLIER_RETURN_TARGET && approval.targetEntityType !== RECOVERY_ASSESSMENT_TARGET
    ? await listEnterpriseApprovalCandidates({ organizationId, requesterUserId: approval.requestedByUserId, moduleCode })
    : { candidates: [], selfApprovalOverrideAvailable: false };
  const delegates = candidateResult.candidates.filter((candidate) => candidate.userId !== approval.approverUserId && candidate.userId !== approval.requestedByUserId);
  const isAssignedValidator = approval.approverUserId === session.userId;
  const isRequester = approval.requestedByUserId === session.userId;
  const selfApprovalAllowed = candidateResult.candidates.some((candidate) => candidate.userId === session.userId && candidate.selfApprovalOverride);
  const requiresIndependentReview = ["EnterpriseStockLotReclassification", SUPPLIER_RETURN_TARGET, RECOVERY_ASSESSMENT_TARGET].includes(approval.targetEntityType);
  const canDecide = approval.status === "PENDING" && isAssignedValidator && (!isRequester || (!requiresIndependentReview && selfApprovalAllowed));
  const correctionSupported = supportsProfessionalApprovalCorrection(approval.targetEntityType);
  const capabilities = {
    canView: true,
    canComment: true,
    canApprove: canDecide,
    canReject: canDecide,
    canRequestCorrection: correctionSupported && canDecide,
    canCancel: requiresIndependentReview && approval.status === "PENDING" && isRequester,
    canDelegate: !requiresIndependentReview && approval.status === "PENDING" && Boolean(moduleCode) && delegates.length > 0 && (access.canManage || (isAssignedValidator && !isRequester)),
    canResubmit: correctionSupported && approval.status === "CORRECTION_REQUESTED" && (access.canManage || isRequester),
  };

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, approvalId: id, domain: "approval-coordination", moduleCode } });
  return NextResponse.json({
    approval,
    versions,
    decisions,
    comments,
    delegates: delegates.map((candidate) => ({ id: candidate.userId, label: candidate.positionTitle ? `${candidate.name} · ${candidate.positionTitle}` : candidate.name, email: candidate.email })),
    sourceDeepLink: recoveryAssessment ? `/enterprise-modules/INVENTORY_LOGISTICS?custodyId=${encodeURIComponent(recoveryAssessment.custodyId)}` : supplierReturn ? `/enterprise-modules/SUPPLIERS_PURCHASES?purchase=${encodeURIComponent(supplierReturn.purchaseId)}&returnMovement=${encodeURIComponent(supplierReturn.sourceMovementId)}` : enterpriseApprovalTargetDeepLink(approval.targetEntityType, approval.targetEntityId, approval.id),
    capabilities,
    recoveryAssessment:recoveryAssessment?{status:recoveryAssessment.status,withdrawnAt:recoveryAssessment.withdrawnAt,withdrawalReason:recoveryAssessment.withdrawalReason,custodyStatus:recoveryAssessment.custody.status,stale:recoveryAssessment.custodyRevision!==recoveryAssessment.custody.revision,physicalReleaseAuthorized:false,accountingRecognitionAuthorized:false}:null,
    supplierReturn: supplierReturn ? { status:supplierReturn.status,cancelledAfterApprovalAt:supplierReturn.cancelledAfterApprovalAt,cancellationReason:supplierReturn.cancellationReason } : null,
  });
}
