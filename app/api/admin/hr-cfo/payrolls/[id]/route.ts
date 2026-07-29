import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getPayrollActor, getPayrollForHrCfo, isPayrollWorkflowError, payrollUpdateSchema, updatePreparedPayroll } from "@/lib/payroll-workflow";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const access = await requireAdminBlockAccess("hrCfo");
  if (access.response) return access.response;
  const session = access.session;
  if (!isDtscInternalSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await getPayrollActor(session.userId);
  if (!actor) return NextResponse.json({ error: "Employee required" }, { status: 403 });
  const { id } = await params;
  try {
    const payroll = await getPayrollForHrCfo(actor, id);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ payroll });
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Chargement impossible." }, { status });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await requireAdminBlockAccess("hrCfo");
  if (access.response) return access.response;
  const session = access.session;
  if (!isDtscInternalSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `payroll-update:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = payrollUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Correction invalide." }, { status: 400 });
  const actor = await getPayrollActor(session.userId);
  if (!actor) return NextResponse.json({ error: "Employee required" }, { status: 403 });
  const { id } = await params;
  try {
    const payroll = await updatePreparedPayroll(actor, id, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "PAYROLL_UPDATED", entity: "HrcfoPayroll", entityId: id, request: req, metadata: { status: payroll.status, netAmount: payroll.netAmount, workCoverage: payroll.workCoverage } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, payroll });
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "payroll_update_failed" } });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Correction impossible." }, { status });
  }
}
