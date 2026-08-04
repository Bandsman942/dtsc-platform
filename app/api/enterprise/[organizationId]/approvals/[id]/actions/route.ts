import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { decideEnterpriseApproval } from "@/lib/enterprise/core-v2/service";
import { enterpriseApprovalActionSchema } from "@/lib/enterprise/core-v2/validators";
import { decideEnterpriseBudgetApproval } from "@/lib/enterprise/finance/budget-service";
import { decideEnterpriseExpenseApproval } from "@/lib/enterprise/finance/expense-service";
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

const professionalApprovalActionSchema = z.object({
  action: z.enum(["REQUEST_CORRECTION", "RESUBMIT", "DELEGATE"]),
  revision: z.coerce.number().int().min(1),
  decisionComment: z.string().trim().max(3000).optional(),
  delegateUserId: z.string().trim().max(160).optional(),
  idempotencyKey: z.string().trim().max(240).optional(),
});

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
  const professional = ["REQUEST_CORRECTION", "RESUBMIT", "DELEGATE"].includes(action);
  const parsed = professional ? professionalApprovalActionSchema.safeParse(payload) : enterpriseApprovalActionSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "La décision demandée est invalide." }, { status: 400 });
  const current = await prisma.enterpriseApproval.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
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
    if (["APPROVE", "REJECT"].includes(data.action)) {
      if (!access.canManage && current.approverUserId !== session.userId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      if (!access.canManage && current.requestedByUserId === session.userId) return NextResponse.json({ error: "SELF_APPROVAL_FORBIDDEN", message: "Vous ne pouvez pas décider sur votre propre soumission." }, { status: 403 });
      await ensureApprovalSubmissionVersion({ organizationId, approvalId: id, actorUserId: current.requestedByUserId });
    }
    const args = { organizationId, approvalId: id, actorUserId: session.userId, action: data.action, revision: data.revision, decisionComment: data.decisionComment || undefined, canManage: access.canManage };
    const approval = current.targetEntityType === "EnterprisePurchase"
      ? await decideEnterprisePurchaseApproval(args)
      : current.targetEntityType === "EnterpriseBudget"
        ? await decideEnterpriseBudgetApproval(args)
        : current.targetEntityType === "EnterpriseExpense"
          ? await decideEnterpriseExpenseApproval(args)
          : await decideEnterpriseApproval(args);
    if (data.action === "APPROVE" || data.action === "REJECT") {
      await recordApprovalDecision({ organizationId, approvalId: id, actorUserId: session.userId, decision: data.action, reason: data.decisionComment, idempotencyKey: typeof payload?.idempotencyKey === "string" ? payload.idempotencyKey : null });
    }
    if (current.requestedByUserId !== session.userId) {
      await notifyUser({ userId: current.requestedByUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: data.action === "APPROVE" ? "Validation approuvée" : data.action === "REJECT" ? "Validation rejetée" : "Validation annulée", body: data.decisionComment || "Une décision a été prise sur votre demande de validation.", targetUrl: workCoordinationDeepLink("APPROVAL", id) });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_APPROVAL_${data.action}`, entity: "EnterpriseApproval", entityId: id, request: req, metadata: { organizationId, targetEntityType: current.targetEntityType, targetEntityId: current.targetEntityId, fromStatus: current.status, toStatus: approval?.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action: data.action } });
    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    if (error instanceof ApprovalCoordinationError) {
      await writeApiLog({ request: req, statusCode: error.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action, error: error.code } });
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
