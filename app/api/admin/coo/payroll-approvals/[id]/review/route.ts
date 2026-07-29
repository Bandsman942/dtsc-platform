import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getPayrollActor, isPayrollWorkflowError, payrollReviewSchema, reviewPayroll } from "@/lib/payroll-workflow";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await requireAdminBlockAccess("coo");
  if (access.response) return access.response;
  const session = access.session;
  if (!isDtscInternalSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `coo-payroll-review:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = payrollReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Décision invalide." }, { status: 400 });
  const actor = await getPayrollActor(session.userId);
  if (!actor) return NextResponse.json({ error: "Employee required" }, { status: 403 });
  const { id } = await params;
  try {
    const payroll = await reviewPayroll({ actor, payrollId: id, expectedApproverCode: "COO", action: parsed.data.action, comment: parsed.data.comment });
    const auditAction = parsed.data.action === "APPROVED" ? "PAYROLL_APPROVED" : parsed.data.action === "CHANGES_REQUESTED" ? "PAYROLL_CHANGES_REQUESTED" : "PAYROLL_REJECTED";
    await writeAuditLog({ userId: session.userId, action: auditAction, entity: "HrcfoPayroll", entityId: id, request: req, metadata: { approverEmployeeId: actor.id, transactionId: payroll.transactionId, status: payroll.status } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, payroll });
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "coo_payroll_review_failed", code: isPayrollWorkflowError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Décision impossible." }, { status });
  }
}
