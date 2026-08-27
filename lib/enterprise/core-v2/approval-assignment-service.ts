import { Prisma } from "@prisma/client";
import { assertEnterpriseApprovalCandidate, assertEnterpriseApprovalDecision } from "@/lib/enterprise/approval-assignment";
import { EnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseApproval, decideEnterpriseApproval } from "@/lib/enterprise/core-v2/service";
import { prisma } from "@/lib/prisma";

const MODULE_BY_TARGET: Record<string, string> = {
  EnterpriseRequest: "INTERNAL_REQUESTS",
  EnterpriseTask: "TASKS_OPERATIONS",
  EnterpriseMeeting: "MEETINGS",
  PharmacyQualityIncident: "QUALITY_PHARMACOVIGILANCE",
};

function assignmentError(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : fallback;
  const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 403;
  const message = error instanceof Error ? error.message : "Cette affectation de validation n’est plus autorisée.";
  return new EnterpriseCoreV2Error(message, Number.isFinite(status) ? status : 403, code);
}

async function requireSelfApprovalTarget(tx: Prisma.TransactionClient, organizationId: string, targetEntityType: string, targetEntityId: string) {
  const moduleCode = MODULE_BY_TARGET[targetEntityType];
  if (!moduleCode) throw new EnterpriseCoreV2Error("Ce type d’objet n’utilise pas le moteur générique de validation.", 400, "INVALID_APPROVAL_TARGET_TYPE");
  if (targetEntityType === "EnterpriseRequest") {
    const target = await tx.enterpriseRequest.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!target) throw new EnterpriseCoreV2Error("La demande ciblée est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
    if (!["SUBMITTED", "IN_REVIEW"].includes(target.status)) throw new EnterpriseCoreV2Error("Une demande doit être soumise ou en revue avant validation.", 409, "INVALID_REQUEST_APPROVAL_STATE");
    return { moduleCode, status: target.status };
  }
  if (targetEntityType === "EnterpriseTask") {
    const target = await tx.enterpriseTask.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!target) throw new EnterpriseCoreV2Error("La tâche ciblée est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
    return { moduleCode, status: target.status };
  }
  if (targetEntityType === "EnterpriseMeeting") {
    const target = await tx.enterpriseMeeting.findFirst({ where: { id: targetEntityId, organizationId, archivedAt: null }, select: { id: true, status: true } });
    if (!target) throw new EnterpriseCoreV2Error("La réunion ciblée est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
    return { moduleCode, status: target.status };
  }
  const target = await tx.pharmacyQualityIncident.findFirst({ where: { id: targetEntityId, organizationId }, select: { id: true, status: true } });
  if (!target) throw new EnterpriseCoreV2Error("L’incident pharmacie ciblé est introuvable dans cette entreprise.", 400, "INVALID_APPROVAL_TARGET");
  return { moduleCode, status: target.status };
}

export async function createAssignedEnterpriseApproval({
  organizationId,
  actorUserId,
  targetEntityType,
  targetEntityId,
  approverUserId,
}: {
  organizationId: string;
  actorUserId: string;
  targetEntityType: string;
  targetEntityId: string;
  approverUserId: string;
}) {
  const moduleCode = MODULE_BY_TARGET[targetEntityType];
  if (!moduleCode) return createEnterpriseApproval({ organizationId, actorUserId, targetEntityType, targetEntityId, approverUserId });
  let candidate: Awaited<ReturnType<typeof assertEnterpriseApprovalCandidate>>;
  try {
    candidate = await assertEnterpriseApprovalCandidate({ organizationId, requesterUserId: actorUserId, approverUserId, moduleCode });
  } catch (error) {
    throw assignmentError(error, "APPROVER_NOT_ELIGIBLE");
  }
  if (!candidate.selfApprovalOverride) return createEnterpriseApproval({ organizationId, actorUserId, targetEntityType, targetEntityId, approverUserId });

  return prisma.$transaction(async (tx) => {
    const target = await requireSelfApprovalTarget(tx, organizationId, targetEntityType, targetEntityId);
    const existing = await tx.enterpriseApproval.findFirst({ where: { organizationId, targetEntityType, targetEntityId, status: "PENDING", archivedAt: null }, select: { id: true } });
    if (existing) throw new EnterpriseCoreV2Error("Une validation en attente existe déjà pour cet objet.", 409, "PENDING_APPROVAL_EXISTS");
    const approval = await tx.enterpriseApproval.create({ data: { organizationId, targetEntityType, targetEntityId, requestedByUserId: actorUserId, approverUserId, status: "PENDING" } });
    if (targetEntityType === "EnterpriseRequest" && target.status === "SUBMITTED") {
      const promoted = await tx.enterpriseRequest.updateMany({ where: { id: targetEntityId, organizationId, status: "SUBMITTED", archivedAt: null }, data: { status: "IN_REVIEW", revision: { increment: 1 } } });
      if (promoted.count !== 1) throw new EnterpriseCoreV2Error("La demande a changé pendant la création de validation.", 409, "CONCURRENT_REQUEST_UPDATE");
    }
    await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseApproval", entityId: approval.id, eventType: "ENTERPRISE_APPROVAL_REQUESTED", summary: "Validation demandée avec dérogation d’auto-validation disponible.", actorUserId, toStatus: "PENDING", metadataJson: { targetEntityType, targetEntityId, moduleCode, selfApprovalOverride: true } } });
    return approval;
  });
}

export async function decideAssignedEnterpriseApproval(args: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  action: "APPROVE" | "REJECT" | "CANCEL";
  revision: number;
  decisionComment?: string | null;
  canManage: boolean;
}) {
  if (args.action === "CANCEL") return decideEnterpriseApproval(args);
  const pending = await prisma.enterpriseApproval.findFirst({ where: { id: args.approvalId, organizationId: args.organizationId, status: "PENDING", archivedAt: null }, select: { targetEntityType: true, targetEntityId: true, requestedByUserId: true, approverUserId: true } });
  if (!pending) throw new EnterpriseCoreV2Error("Validation introuvable.", 404, "APPROVAL_NOT_FOUND");
  const moduleCode = MODULE_BY_TARGET[pending.targetEntityType];
  if (!moduleCode) return decideEnterpriseApproval(args);

  let decision: Awaited<ReturnType<typeof assertEnterpriseApprovalDecision>>;
  try {
    decision = await assertEnterpriseApprovalDecision({ organizationId: args.organizationId, requesterUserId: pending.requestedByUserId, approverUserId: pending.approverUserId, actorUserId: args.actorUserId, moduleCode });
  } catch (error) {
    throw assignmentError(error, "APPROVAL_DECISION_DENIED");
  }
  if (!decision.selfApprovalOverride) return decideEnterpriseApproval(args);
  if (args.action === "REJECT" && !args.decisionComment?.trim()) throw new EnterpriseCoreV2Error("Un motif est obligatoire pour rejeter une validation.", 400, "REJECTION_REASON_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: args.approvalId, organizationId: args.organizationId, status: "PENDING", archivedAt: null } });
    if (!approval) throw new EnterpriseCoreV2Error("Validation introuvable.", 404, "APPROVAL_NOT_FOUND");
    if (approval.approverUserId !== args.actorUserId) throw new EnterpriseCoreV2Error("Seul le validateur désigné peut prendre cette décision.", 403, "WRONG_APPROVER");
    const nextStatus = args.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await tx.enterpriseApproval.updateMany({
      where: { id: approval.id, organizationId: args.organizationId, status: "PENDING", revision: args.revision, archivedAt: null },
      data: { status: nextStatus, decidedAt: new Date(), decisionComment: args.decisionComment?.trim() || "SELF_APPROVAL_OVERRIDE", revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new EnterpriseCoreV2Error("La validation a été modifiée simultanément.", 409, "APPROVAL_DECISION_CONFLICT");
    if (approval.targetEntityType === "EnterpriseRequest") {
      const requestStatus = args.action === "APPROVE" ? "APPROVED" : "REJECTED";
      const requestUpdated = await tx.enterpriseRequest.updateMany({ where: { id: approval.targetEntityId, organizationId: args.organizationId, status: { in: ["SUBMITTED", "IN_REVIEW"] }, archivedAt: null }, data: { status: requestStatus, revision: { increment: 1 }, ...(requestStatus === "REJECTED" ? { closedAt: new Date() } : {}) } });
      if (requestUpdated.count !== 1) throw new EnterpriseCoreV2Error("La demande cible a changé pendant la décision.", 409, "APPROVAL_TARGET_CONFLICT");
    }
    await tx.enterpriseOperationalEvent.create({ data: { organizationId: args.organizationId, entityType: "EnterpriseApproval", entityId: approval.id, eventType: args.action === "APPROVE" ? "ENTERPRISE_APPROVAL_APPROVED" : "ENTERPRISE_APPROVAL_REJECTED", summary: args.decisionComment?.trim() || "Décision prise via dérogation d’auto-validation.", actorUserId: args.actorUserId, fromStatus: "PENDING", toStatus: nextStatus, metadataJson: { selfApprovalOverride: true, moduleCode } } });
    return tx.enterpriseApproval.findUnique({ where: { id: approval.id } });
  });
}
