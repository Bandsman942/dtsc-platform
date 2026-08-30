import { Prisma } from "@prisma/client";
import { assertEnterpriseApprovalCandidate } from "@/lib/enterprise/approval-assignment";
import { enterpriseApprovalModuleForTarget } from "@/lib/enterprise/approval-targets";
import { prisma } from "@/lib/prisma";

export type ProfessionalApprovalAction = "REQUEST_CORRECTION" | "RESUBMIT" | "DELEGATE";

const CORRECTION_CAPABLE_TARGETS = new Set(["EnterpriseTask", "EnterpriseRequest"]);

export class ApprovalCoordinationError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}

export function supportsProfessionalApprovalCorrection(targetEntityType: string) {
  return CORRECTION_CAPABLE_TARGETS.has(targetEntityType);
}

export async function ensureApprovalSubmissionVersion(args: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  comment?: string | null;
}) {
  return prisma.$transaction(async (tx) => ensureSubmissionVersionInTransaction(tx, args));
}

export async function recordApprovalDecision(args: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string | null;
  idempotencyKey?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const version = await ensureSubmissionVersionInTransaction(tx, args);
    const key = args.idempotencyKey?.trim() || `approval:${args.approvalId}:version:${version.versionNumber}:actor:${args.actorUserId}:${args.decision}`;
    const existing = await tx.enterpriseApprovalDecision.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
    return tx.enterpriseApprovalDecision.create({
      data: {
        organizationId: args.organizationId,
        approvalId: args.approvalId,
        submissionVersionId: version.id,
        actorUserId: args.actorUserId,
        decision: args.decision,
        reason: normalize(args.reason),
        idempotencyKey: key,
      },
    });
  });
}

export async function applyProfessionalApprovalAction(args: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  canManage: boolean;
  action: ProfessionalApprovalAction;
  reason?: string | null;
  delegateUserId?: string | null;
  revision: number;
}) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.enterpriseApproval.findFirst({ where: { id: args.approvalId, organizationId: args.organizationId, archivedAt: null } });
    if (!approval) throw new ApprovalCoordinationError("NOT_FOUND", 404, "Validation introuvable.");
    if (approval.revision !== args.revision) throw new ApprovalCoordinationError("VERSION_MISMATCH", 409, "Cette validation a été modifiée. Actualisez avant de continuer.");

    if (args.action === "RESUBMIT") {
      if (!supportsProfessionalApprovalCorrection(approval.targetEntityType)) throw new ApprovalCoordinationError("TARGET_ACTION_NOT_SUPPORTED", 400, "Ce type de validation ne prend pas en charge le cycle correction / resoumission.");
      if (!args.canManage && approval.requestedByUserId !== args.actorUserId) throw new ApprovalCoordinationError("FORBIDDEN", 403, "Seul le demandeur peut soumettre la correction.");
      if (approval.status !== "CORRECTION_REQUESTED") throw new ApprovalCoordinationError("INVALID_STATE", 409, "Cette validation n’attend pas de correction.");
      await syncTargetForResubmission(tx, approval.targetEntityType, approval.targetEntityId, args.organizationId);
      const latest = await tx.enterpriseApprovalSubmissionVersion.findFirst({ where: { organizationId: args.organizationId, approvalId: approval.id }, orderBy: { versionNumber: "desc" } });
      const snapshot = await approvalTargetSnapshot(tx, args.organizationId, approval.targetEntityType, approval.targetEntityId);
      const version = await tx.enterpriseApprovalSubmissionVersion.create({
        data: {
          organizationId: args.organizationId,
          approvalId: approval.id,
          versionNumber: (latest?.versionNumber || 0) + 1,
          submittedByUserId: args.actorUserId,
          snapshotJson: snapshot,
          submissionComment: normalize(args.reason),
        },
      });
      const updated = await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "PENDING", decisionComment: null, decidedAt: null, revision: { increment: 1 } } });
      await addApprovalEvent(tx, args.organizationId, approval.id, args.actorUserId, "APPROVAL_RESUBMITTED", `Correction soumise en version ${version.versionNumber}.`, approval.status, updated.status, { submissionVersionId: version.id });
      return { approval: updated, submissionVersion: version };
    }

    if (!args.canManage && approval.approverUserId !== args.actorUserId) throw new ApprovalCoordinationError("FORBIDDEN", 403, "Cette décision n’est pas attribuée à cet utilisateur.");
    if (approval.status !== "PENDING") throw new ApprovalCoordinationError("ALREADY_DECIDED", 409, "Cette validation n’est plus en attente.");
    if (approval.requestedByUserId === args.actorUserId && !args.canManage) throw new ApprovalCoordinationError("SELF_APPROVAL_FORBIDDEN", 403, "Vous ne pouvez pas décider sur votre propre soumission.");

    if (args.action === "DELEGATE") {
      const delegateUserId = args.delegateUserId?.trim();
      if (!delegateUserId) throw new ApprovalCoordinationError("VALIDATION_ERROR", 400, "Le nouveau validateur est obligatoire.");
      if (delegateUserId === approval.requestedByUserId) throw new ApprovalCoordinationError("VALIDATOR_NOT_ALLOWED", 400, "Le demandeur ne peut pas devenir son propre validateur par délégation.");
      const moduleCode = enterpriseApprovalModuleForTarget(approval.targetEntityType);
      if (!moduleCode) throw new ApprovalCoordinationError("TARGET_NOT_SUPPORTED", 400, "Ce type de validation ne supporte pas encore la délégation gouvernée.");
      try {
        await assertEnterpriseApprovalCandidate({ organizationId: args.organizationId, requesterUserId: approval.requestedByUserId, approverUserId: delegateUserId, moduleCode });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "APPROVER_NOT_ELIGIBLE";
        const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 403;
        throw new ApprovalCoordinationError(code, Number.isFinite(status) ? status : 403, error instanceof Error ? error.message : "Le validateur délégué n’est pas autorisé pour ce module.");
      }
      await syncTargetApproverForDelegation(tx, approval.targetEntityType, approval.targetEntityId, args.organizationId, delegateUserId);
      const updated = await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { approverUserId: delegateUserId, revision: { increment: 1 } } });
      await addApprovalEvent(tx, args.organizationId, approval.id, args.actorUserId, "APPROVAL_DELEGATED", "Validation déléguée à un autre validateur autorisé.", approval.status, updated.status, { previousApproverUserId: approval.approverUserId, approverUserId: delegateUserId, moduleCode });
      return { approval: updated };
    }

    if (!supportsProfessionalApprovalCorrection(approval.targetEntityType)) throw new ApprovalCoordinationError("TARGET_ACTION_NOT_SUPPORTED", 400, "Ce type de validation ne prend pas en charge le cycle correction / resoumission.");
    const reason = normalize(args.reason);
    if (!reason) throw new ApprovalCoordinationError("CORRECTION_REASON_REQUIRED", 400, "Le motif de correction est obligatoire.");
    const version = await ensureSubmissionVersionInTransaction(tx, { organizationId: args.organizationId, approvalId: approval.id, actorUserId: approval.requestedByUserId });
    await syncTargetForCorrection(tx, approval.targetEntityType, approval.targetEntityId, args.organizationId);
    const updated = await tx.enterpriseApproval.update({ where: { id: approval.id }, data: { status: "CORRECTION_REQUESTED", decisionComment: reason, decidedAt: null, revision: { increment: 1 } } });
    await addApprovalEvent(tx, args.organizationId, approval.id, args.actorUserId, "APPROVAL_CORRECTION_REQUESTED", reason, approval.status, updated.status, { submissionVersionId: version.id });
    return { approval: updated, submissionVersion: version };
  });
}

async function ensureSubmissionVersionInTransaction(tx: Prisma.TransactionClient, args: { organizationId: string; approvalId: string; actorUserId: string; comment?: string | null }) {
  const existing = await tx.enterpriseApprovalSubmissionVersion.findFirst({ where: { organizationId: args.organizationId, approvalId: args.approvalId }, orderBy: { versionNumber: "desc" } });
  if (existing) return existing;
  const approval = await tx.enterpriseApproval.findFirst({ where: { id: args.approvalId, organizationId: args.organizationId, archivedAt: null } });
  if (!approval) throw new ApprovalCoordinationError("NOT_FOUND", 404, "Validation introuvable.");
  const snapshot = await approvalTargetSnapshot(tx, args.organizationId, approval.targetEntityType, approval.targetEntityId);
  return tx.enterpriseApprovalSubmissionVersion.create({
    data: {
      organizationId: args.organizationId,
      approvalId: approval.id,
      versionNumber: 1,
      submittedByUserId: approval.requestedByUserId || args.actorUserId,
      snapshotJson: snapshot,
      submissionComment: normalize(args.comment),
    },
  });
}

async function approvalTargetSnapshot(tx: Prisma.TransactionClient, organizationId: string, entityType: string, entityId: string): Promise<Prisma.InputJsonValue> {
  if (entityType === "EnterpriseTask") {
    const item = await tx.enterpriseTask.findFirst({ where: { id: entityId, organizationId }, select: { id: true, title: true, description: true, status: true, priority: true, assignedToUserId: true, startAt: true, dueAt: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Tâche source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseRequest") {
    const item = await tx.enterpriseRequest.findFirst({ where: { id: entityId, organizationId }, select: { id: true, requestType: true, title: true, description: true, status: true, priority: true, assignedToUserId: true, dueAt: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Demande source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseMeeting") {
    const item = await tx.enterpriseMeeting.findFirst({ where: { id: entityId, organizationId }, select: { id: true, title: true, agenda: true, status: true, startAt: true, endAt: true, locationMode: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Réunion source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterprisePurchase") {
    const item = await tx.enterprisePurchase.findFirst({ where: { id: entityId, organizationId }, select: { id: true, reference: true, title: true, description: true, status: true, priority: true, currency: true, totalAmount: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Achat source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseBudget") {
    const item = await tx.enterpriseBudget.findFirst({
      where: { id: entityId, organizationId },
      select: {
        id: true,
        reference: true,
        title: true,
        description: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        currency: true,
        departmentId: true,
        revision: true,
        updatedAt: true,
        lines: { select: { id: true, code: true, name: true, category: true, departmentId: true, plannedAmount: true } },
      },
    });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Budget source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseExpense") {
    const item = await tx.enterpriseExpense.findFirst({ where: { id: entityId, organizationId }, select: { id: true, reference: true, title: true, status: true, currency: true, amount: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Dépense source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseAccountTransfer") {
    const item = await tx.enterpriseAccountTransfer.findFirst({ where: { id: entityId, organizationId }, select: { id: true, number: true, status: true, sourceAmount: true, sourceCurrencyCode: true, targetAmount: true, targetCurrencyCode: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Transfert source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseLeaveRequest") {
    const item = await tx.enterpriseLeaveRequest.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, reference: true, leaveType: true, startDate: true, endDate: true, status: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Congé source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseEmploymentContract") {
    const item = await tx.enterpriseEmploymentContract.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, reference: true, contractType: true, jobTitle: true, status: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Contrat de travail source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterpriseTimesheet") {
    const item = await tx.enterpriseTimesheet.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, reference: true, periodStart: true, periodEnd: true, status: true, totalDeclaredMinutes: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Feuille de temps source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "EnterprisePayrollRun") {
    const item = await tx.enterprisePayrollRun.findFirst({ where: { id: entityId, organizationId, archivedAt: null }, select: { id: true, reference: true, status: true, employeeCount: true, netAmount: true, currency: true, revision: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Paie source introuvable.");
    return serializeSnapshot(item);
  }
  if (entityType === "PharmacyQualityIncident") {
    const item = await tx.pharmacyQualityIncident.findFirst({ where: { id: entityId, organizationId }, select: { id: true, title: true, description: true, status: true, priority: true, updatedAt: true } });
    if (!item) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "Incident qualité source introuvable.");
    return serializeSnapshot(item);
  }
  throw new ApprovalCoordinationError("TARGET_NOT_SUPPORTED", 400, "Ce type d’objet ne prend pas encore en charge le suivi versionné des validations.");
}

function serializeSnapshot(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function syncTargetApproverForDelegation(tx: Prisma.TransactionClient, entityType: string, entityId: string, organizationId: string, approverUserId: string) {
  if (entityType === "EnterpriseLeaveRequest") {
    const updated = await tx.enterpriseLeaveRequest.updateMany({ where: { id: entityId, organizationId, status: "SUBMITTED", archivedAt: null }, data: { approverUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new ApprovalCoordinationError("TARGET_CONFLICT", 409, "Le congé lié a changé pendant la délégation.");
  }
  if (entityType === "EnterpriseTimesheet") {
    const updated = await tx.enterpriseTimesheet.updateMany({ where: { id: entityId, organizationId, status: "SUBMITTED", archivedAt: null }, data: { approverUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new ApprovalCoordinationError("TARGET_CONFLICT", 409, "La feuille de temps liée a changé pendant la délégation.");
  }
  if (entityType === "EnterprisePayrollRun") {
    const updated = await tx.enterprisePayrollRun.updateMany({ where: { id: entityId, organizationId, status: "PENDING_APPROVAL", archivedAt: null }, data: { approverUserId, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new ApprovalCoordinationError("TARGET_CONFLICT", 409, "La paie liée a changé pendant la délégation.");
  }
}

async function syncTargetForCorrection(tx: Prisma.TransactionClient, entityType: string, entityId: string, organizationId: string) {
  if (entityType === "EnterpriseRequest") {
    const updated = await tx.enterpriseRequest.updateMany({ where: { id: entityId, organizationId, archivedAt: null }, data: { status: "DRAFT", closedAt: null, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new ApprovalCoordinationError("TARGET_CONFLICT", 409, "La demande liée a changé pendant la demande de correction.");
  }
  if (entityType === "EnterpriseTask") {
    const exists = await tx.enterpriseTask.count({ where: { id: entityId, organizationId, archivedAt: null } });
    if (!exists) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "La tâche liée est introuvable.");
  }
}

async function syncTargetForResubmission(tx: Prisma.TransactionClient, entityType: string, entityId: string, organizationId: string) {
  if (entityType === "EnterpriseRequest") {
    const updated = await tx.enterpriseRequest.updateMany({ where: { id: entityId, organizationId, status: "DRAFT", archivedAt: null }, data: { status: "SUBMITTED", revision: { increment: 1 } } });
    if (updated.count !== 1) throw new ApprovalCoordinationError("TARGET_CONFLICT", 409, "La demande liée doit être en brouillon corrigé avant resoumission.");
  }
  if (entityType === "EnterpriseTask") {
    const exists = await tx.enterpriseTask.count({ where: { id: entityId, organizationId, archivedAt: null } });
    if (!exists) throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "La tâche liée est introuvable.");
  }
}

async function addApprovalEvent(tx: Prisma.TransactionClient, organizationId: string, approvalId: string, actorUserId: string, eventType: string, summary: string, fromStatus: string, toStatus: string, metadata: Prisma.InputJsonValue) {
  await tx.enterpriseOperationalEvent.create({ data: { organizationId, entityType: "EnterpriseApproval", entityId: approvalId, eventType, summary, actorUserId, fromStatus, toStatus, metadataJson: metadata } });
}

function normalize(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
