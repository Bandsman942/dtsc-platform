import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assignCashSessionApproverSchema } from "@/lib/enterprise/accounting/accounting-approval-schemas";
import { assignCashSessionApproverRecovery } from "@/lib/enterprise/accounting/accounting-operations-approval-orchestration";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { prisma } from "@/lib/prisma";
import { authorizeFinanceRequest, financeErrorResponse } from "@/lib/enterprise/accounting/http";

type Params = { params: Promise<{ organizationId: string; sessionId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "manage");
  if (!auth.ok) return auth.response;

  try {
    const session = await prisma.enterpriseCashSession.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true, cashierUserId: true, status: true },
    });
    if (!session) throw new EnterpriseAccountingError("CASH_SESSION_NOT_FOUND", 404);
    if (session.status !== "PENDING_VALIDATION") throw new EnterpriseAccountingError("CASH_SESSION_CONFLICT", 409);

    const existingApproval = await prisma.enterpriseApproval.findFirst({
      where: {
        organizationId,
        targetEntityType: "EnterpriseCashSession",
        targetEntityId: session.id,
        status: { in: ["PENDING", "QUEUED"] },
        archivedAt: null,
      },
      select: { id: true },
    });
    if (existingApproval) throw new EnterpriseAccountingError("ACCOUNTING_APPROVAL_ALREADY_PENDING", 409);

    const candidates = await listEnterpriseApprovalCandidates({
      organizationId,
      requesterUserId: session.cashierUserId,
      moduleCode: "FINANCE_CASH",
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "cash-sessions", action: "approver-candidates-recovery" },
    });
    return NextResponse.json(candidates);
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_APPROVER_ASSIGNMENT_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, sessionId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CASH", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;

  const parsed = assignCashSessionApproverSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", message: parsed.error.issues[0]?.message || "Sélectionnez un validateur autorisé puis réessayez." },
      { status: 400 },
    );
  }

  try {
    const result = await assignCashSessionApproverRecovery(
      organizationId,
      sessionId,
      auth.session.userId,
      parsed.data,
    );
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_CASH_SESSION_APPROVER_ASSIGNED",
      entity: "EnterpriseCashSession",
      entityId: sessionId,
      request: req,
      metadata: {
        organizationId,
        approvalId: result.approval.id,
        approverUserId: result.approval.approverUserId,
        recovery: true,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: auth.session.userId,
      startedAt,
      metadata: { organizationId, domain: "cash-sessions", action: "assign-approver-recovery" },
    });
    return NextResponse.json({ ok: true, session: result.session });
  } catch (error) {
    return financeErrorResponse(error, "CASH_SESSION_APPROVER_ASSIGNMENT_FAILED");
  }
}
