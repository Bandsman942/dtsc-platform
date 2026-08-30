import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { approveAssignedAccountTransfer, rejectAssignedAccountTransfer } from "@/lib/enterprise/accounting/treasury-approval-service";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { decideAssignedEnterpriseApproval } from "@/lib/enterprise/core-v2/approval-assignment-service";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { enterpriseApprovalActionSchema } from "@/lib/enterprise/core-v2/validators";
import { decideEnterpriseBudgetApproval } from "@/lib/enterprise/finance/budget-service";
import { decideEnterpriseExpenseApproval } from "@/lib/enterprise/finance/expense-service";
import { decideEnterpriseEmploymentContract } from "@/lib/enterprise/hr-payroll/contracts";
import { decideEnterpriseLeaveRequest } from "@/lib/enterprise/hr-payroll/leave";
import { decideEnterprisePayrollRun } from "@/lib/enterprise/hr-payroll/payroll";
import { decideEnterpriseTimesheet } from "@/lib/enterprise/hr-payroll/timesheets";
import { decideEnterprisePurchaseApproval } from "@/lib/enterprise/procurement/purchase-service";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  applyProfessionalApprovalAction,
  ApprovalCoordinationError,
  ensureApprovalSubmissionVersion,
  recordApprovalDecision,
} from "@/lib/standard-work-coordination/approval-coordination";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";

type Params = { params: Promise<{ organizationId: string; id: string }> };
type CurrentApproval = { id: string; organizationId: string; targetEntityType: string; targetEntityId: string; requestedByUserId: string; approverUserId: string; status: string; revision: number };

const professionalApprovalActionSchema = z.object({
  action: z.enum(["REQUEST_CORRECTION", "RESUBMIT", "DELEGATE"]),
  revision: z.coerce.number().int().min(1),
  decisionComment: z.string().trim().max(3000).optional(),
  delegateUserId: z.string().trim().max(160).optional(),
  idempotencyKey: z.string().trim().max(240).optional(),
});

const prepareReviewSchema = z.object({
  action: z.literal("PREPARE_REVIEW"),
  revision: z.coerce.number().int().min(1),
});

async function targetRevision(organizationId: string, approval: CurrentApproval) {
  if (approval.targetEntityType === "EnterpriseAccountTransfer") {
    return (await prisma.enterpriseAccountTransfer.findFirst({ where: { id: approval.targetEntityId, organizationId }, select: { revision: true } }))?.revision ?? null;
  }
  if (approval.targetEntityType === "EnterpriseLeaveRequest") {
    return (await prisma.enterpriseLeaveRequest.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null }, select: { revision: true } }))?.revision ?? null;
  }
  if (approval.targetEntityType === "EnterpriseEmploymentContract") {
    return (await prisma.enterpriseEmploymentContract.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null }, select: { revision: true } }))?.revision ?? null;
  }
  if (approval.targetEntityType === "EnterpriseTimesheet") {
    return (await prisma.enterpriseTimesheet.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null }, select: { revision: true } }))?.revision ?? null;
  }
  if (approval.targetEntityType === "EnterprisePayrollRun") {
    return (await prisma.enterprisePayrollRun.findFirst({ where: { id: approval.targetEntityId, organizationId, archivedAt: null }, select: { revision: true } }))?.revision ?? null;
  }
  return null;
}

async function decideDomainApproval(
  organizationId: string,
  current: CurrentApproval,
  actorUserId: string,
  data: { action: "APPROVE" | "REJECT" | "CANCEL"; revision: number; decisionComment?: string },
  canManage: boolean,
) {
  const args = { organizationId, approvalId: current.id, actorUserId, action: data.action, revision: data.revision, decisionComment: data.decisionComment || undefined, canManage };
  if (current.targetEntityType === "EnterprisePurchase") return decideEnterprisePurchaseApproval(args);
  if (current.targetEntityType === "EnterpriseBudget") return decideEnterpriseBudgetApproval(args);
  if (current.targetEntityType === "EnterpriseExpense") return decideEnterpriseExpenseApproval(args);
  if (data.action === "CANCEL") return decideAssignedEnterpriseApproval(args);

  const revision = await targetRevision(organizationId, current);
  if (["EnterpriseAccountTransfer", "EnterpriseLeaveRequest", "EnterpriseEmploymentContract", "EnterpriseTimesheet", "EnterprisePayrollRun"].includes(current.targetEntityType) && revision === null) {
    throw new ApprovalCoordinationError("TARGET_NOT_FOUND", 404, "L’objet métier lié à cette validation est introuvable.");
  }
  if (current.targetEntityType === "EnterpriseAccountTransfer") {
    return data.action === "APPROVE"
      ? approveAssignedAccountTransfer(organizationId, current.targetEntityId, actorUserId, revision!)
      : rejectAssignedAccountTransfer(organizationId, current.targetEntityId, actorUserId, revision!, data.decisionComment || "");
  }
  if (current.targetEntityType === "EnterpriseLeaveRequest") {
    return decideEnterpriseLeaveRequest(organizationId, current.targetEntityId, actorUserId, { decision: data.action, revision: revision!, comment: data.decisionComment });
  }
  if (current.targetEntityType === "EnterpriseEmploymentContract") {
    return decideEnterpriseEmploymentContract(organizationId, current.targetEntityId, actorUserId, { decision: data.action, revision: revision!, comment: data.decisionComment });
  }
  if (current.targetEntityType === "EnterpriseTimesheet") {
    return decideEnterpriseTimesheet(organizationId, current.targetEntityId, actorUserId, { decision: data.action, revision: revision!, comment: data.decisionComment });
  }
  if (current.targetEntityType === "EnterprisePayrollRun") {
    return decideEnterprisePayrollRun(organizationId, current.targetEntityId, actorUserId, { decision: data.action, revision: revision!, comment: data.decisionComment });
  }
  return decideAssignedEnterpriseApproval(args);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-approval-action:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "submit" });
  if (!access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const payload = await req.json().catch(() => null);
  const action = typeof payload?.action === "string" ? payload.action : "";
  const prepareReview = action === "PREPARE_REVIEW";
  const professional = ["REQUEST_CORRECTION", "RESUBMIT", "DELEGATE"].includes(action);
  const parsed = prepareReview
    ? prepareReviewSchema.safeParse(payload)
    : professional
      ? professionalApprovalActionSchema.safeParse(payload)
      : enterpriseApprovalActionSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "La décision demandée est invalide." }, { status: 400 });
  const current = await prisma.enterpriseApproval.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    if (prepareReview) {
      const data = prepareReviewSchema.parse(payload);
      if (current.status !== "PENDING") throw new ApprovalCoordinationError("INVALID_STATE", 409, "Cette validation n’est plus en attente de revue.");
      if (current.revision !== data.revision) throw new ApprovalCoordinationError("VERSION_MISMATCH", 409, "Cette validation a changé. Actualisez avant de préparer la revue.");
      if (!access.canManage && current.approverUserId !== session.userId && current.requestedByUserId !== session.userId) {
        throw new ApprovalCoordinationError("FORBIDDEN", 403, "Vous ne pouvez pas préparer la revue de cette validation.");
      }
      const version = await ensureApprovalSubmissionVersion({ organizationId, approvalId: id, actorUserId: current.requestedByUserId });
      await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_APPROVAL_REVIEW_PREPARED", entity: "EnterpriseApproval", entityId: id, request: req, metadata: { organizationId, submissionVersionId: version.id, versionNumber: version.versionNumber } });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action } });
      return NextResponse.json({ ok: true, submissionVersion: version });
    }

    if (professional) {
      const data = professionalApprovalActionSchema.parse(payload);
      const result = await applyProfessionalApprovalAction({
        organizationId,
        approvalId: id,
        actorUserId: session.userId,
        canManage: access.canManage,
        action: data.action,
        reason: data.decisionComment,
        delegateUserId: data.delegateUserId,
        revision: data.revision,
      });
      const recipientId = data.action === "REQUEST_CORRECTION" ? current.requestedByUserId : data.action === "DELEGATE" ? result.approval.approverUserId : current.approverUserId;
      if (recipientId !== session.userId) {
        await notifyUser({
          userId: recipientId,
          organizationId,
          type: "ENTERPRISE_APPROVAL",
          title: data.action === "REQUEST_CORRECTION" ? "Correction demandée" : data.action === "DELEGATE" ? "Validation déléguée" : "Correction soumise",
          body: data.decisionComment || "Une action est attendue sur cette validation.",
          targetUrl: workCoordinationDeepLink("APPROVAL", id),
        });
      }
      await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_APPROVAL_${data.action}`, entity: "EnterpriseApproval", entityId: id, request: req, metadata: { organizationId, targetEntityType: current.targetEntityType, targetEntityId: current.targetEntityId, fromStatus: current.status, toStatus: result.approval.status } });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action: data.action } });
      return NextResponse.json({ ok: true, ...result });
    }

    const data = enterpriseApprovalActionSchema.parse(payload);
    if (data.action === "REJECT" && !(data.decisionComment || "").trim()) {
      throw new ApprovalCoordinationError("REJECTION_REASON_REQUIRED", 400, "Un motif est obligatoire pour rejeter une validation.");
    }
    if (["APPROVE", "REJECT"].includes(data.action)) {
      if (current.approverUserId !== session.userId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      const version = await ensureApprovalSubmissionVersion({ organizationId, approvalId: id, actorUserId: current.requestedByUserId });
      if (!data.reviewedVersionId || data.reviewedVersionId !== version.id) {
        throw new ApprovalCoordinationError("APPROVAL_REVIEW_REQUIRED", 409, "Ouvrez la validation et relisez la version soumise avant de prendre une décision.");
      }
    }
    await decideDomainApproval(organizationId, current, session.userId, data, access.canManage);
    if (data.action === "APPROVE" || data.action === "REJECT") {
      await recordApprovalDecision({ organizationId, approvalId: id, actorUserId: session.userId, decision: data.action, reason: data.decisionComment, idempotencyKey: typeof payload?.idempotencyKey === "string" ? payload.idempotencyKey : null });
    }
    const approval = await prisma.enterpriseApproval.findFirst({ where: { id, organizationId, archivedAt: null } });
    if (current.requestedByUserId !== session.userId) {
      await notifyUser({ userId: current.requestedByUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: data.action === "APPROVE" ? "Validation approuvée" : data.action === "REJECT" ? "Validation rejetée" : "Validation annulée", body: data.decisionComment || "Une décision a été prise sur votre demande de validation.", targetUrl: workCoordinationDeepLink("APPROVAL", id) });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_APPROVAL_${data.action}`, entity: "EnterpriseApproval", entityId: id, request: req, metadata: { organizationId, targetEntityType: current.targetEntityType, targetEntityId: current.targetEntityId, fromStatus: current.status, toStatus: approval?.status, reviewedVersionId: data.reviewedVersionId || null } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action: data.action } });
    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    if (error instanceof ApprovalCoordinationError) {
      await writeApiLog({ request: req, statusCode: error.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action, error: error.code } });
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof EnterpriseDomainError || error instanceof EnterpriseAccountingError) {
      await writeApiLog({ request: req, statusCode: error.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action, error: error.code } });
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
