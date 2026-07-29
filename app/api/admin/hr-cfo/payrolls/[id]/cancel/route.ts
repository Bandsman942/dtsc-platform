import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { cancelPayroll, getPayrollActor, isPayrollWorkflowError, payrollCancelSchema } from "@/lib/payroll-workflow";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await requireAdminBlockAccess("hrCfo");
  if (access.response) return access.response;
  const session = access.session;
  if (!isDtscInternalSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `payroll-cancel:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = payrollCancelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Annulation invalide." }, { status: 400 });
  const actor = await getPayrollActor(session.userId);
  if (!actor) return NextResponse.json({ error: "Employee required" }, { status: 403 });
  const { id } = await params;
  try {
    const payroll = await cancelPayroll(actor, id, parsed.data.reason);
    await writeAuditLog({ userId: session.userId, action: "PAYROLL_CANCELLED", entity: "HrcfoPayroll", entityId: id, request: req, metadata: { reason: parsed.data.reason } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, payroll });
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Annulation impossible." }, { status });
  }
}
