import { NextResponse } from "next/server";
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

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-approval-action:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "VALIDATIONS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = enterpriseApprovalActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "La décision demandée est invalide." }, { status: 400 });
  const current = await prisma.enterpriseApproval.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = parsed.data;
  try {
    const args = { organizationId, approvalId: id, actorUserId: session.userId, action: data.action, revision: data.revision, decisionComment: data.decisionComment || undefined, canManage: access.canManage };
    const approval = current.targetEntityType === "EnterprisePurchase"
      ? await decideEnterprisePurchaseApproval(args)
      : current.targetEntityType === "EnterpriseBudget"
        ? await decideEnterpriseBudgetApproval(args)
        : current.targetEntityType === "EnterpriseExpense"
          ? await decideEnterpriseExpenseApproval(args)
          : await decideEnterpriseApproval(args);
    if (current.requestedByUserId !== session.userId) {
      await notifyUser({ userId: current.requestedByUserId, organizationId, type: "ENTERPRISE_APPROVAL", title: data.action === "APPROVE" ? "Validation approuvée" : data.action === "REJECT" ? "Validation rejetée" : "Validation annulée", body: data.decisionComment || "Une décision a été prise sur votre demande de validation.", targetUrl: "/enterprise-modules/VALIDATIONS" });
    }
    await writeAuditLog({ userId: session.userId, action: `ENTERPRISE_APPROVAL_${data.action}`, entity: "EnterpriseApproval", entityId: id, request: req, metadata: { organizationId, targetEntityType: current.targetEntityType, targetEntityId: current.targetEntityId, fromStatus: current.status, toStatus: approval?.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action: data.action } });
    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    await writeApiLog({ request: req, statusCode: normalized.status, userId: session.userId, startedAt, metadata: { organizationId, domain: "approvals", approvalId: id, action: data.action, error: normalized.code } });
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
