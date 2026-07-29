import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getPayrollActor, getPayrollWorkspace, isPayrollWorkflowError, payrollPrepareSchema, preparePayroll } from "@/lib/payroll-workflow";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const access = await requireAdminBlockAccess("hrCfo");
  if (access.response) {
    await writeApiLog({ request: req, statusCode: access.response.status, startedAt });
    return access.response;
  }
  const session = access.session;
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPayrollActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  try {
    const workspace = await getPayrollWorkspace(actor);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json(workspace);
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "payroll_workspace_failed" } });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Chargement impossible." }, { status });
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "payroll_prepare_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireAdminBlockAccess("hrCfo");
  if (access.response) {
    await writeApiLog({ request: req, statusCode: access.response.status, startedAt });
    return access.response;
  }
  const session = access.session;
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `payroll-prepare:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = payrollPrepareSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Préparation invalide." }, { status: 400 });
  }
  const actor = await getPayrollActor(session.userId);
  if (!actor) return NextResponse.json({ error: "Employee required" }, { status: 403 });
  try {
    const payroll = await preparePayroll(actor, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "PAYROLL_DRAFT_CREATED", entity: "HrcfoPayroll", entityId: payroll.id, request: req, metadata: { employeeId: payroll.employeeId, approvedWorkMinutes: payroll.approvedWorkMinutes, approvedWorkEntryCount: payroll.approvedWorkEntryCount } });
    if ((payroll.approvedWorkEntryCount || 0) > 0) {
      await writeAuditLog({ userId: session.userId, action: "PAYROLL_WORK_EVIDENCE_LINKED", entity: "HrcfoPayroll", entityId: payroll.id, request: req, metadata: { approvedWorkMinutes: payroll.approvedWorkMinutes, approvedWorkEntryCount: payroll.approvedWorkEntryCount, approvedSubmissionCount: payroll.approvedSubmissionCount } });
    }
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, payroll }, { status: 201 });
  } catch (error) {
    const status = isPayrollWorkflowError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "payroll_prepare_failed", code: isPayrollWorkflowError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isPayrollWorkflowError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Préparation impossible." }, { status });
  }
}
