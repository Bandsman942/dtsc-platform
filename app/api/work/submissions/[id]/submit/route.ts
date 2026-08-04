import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  currentDateKey,
  getWorkActor,
  isWorkPrestationError,
  submitWorkSubmission,
  weekPeriodForDate,
  workSubmissionSubmitSchema,
} from "@/lib/work-prestations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "work_submission_submit_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `work-submission-submit:${session.userId}`), 24, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = workSubmissionSubmitSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Soumission invalide." }, { status: 400 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  const { id } = await params;
  const submissionRecord = await prisma.dtscWorkSubmission.findFirst({
    where: { id, employeeId: actor.id },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  if (!submissionRecord) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "NOT_FOUND", message: "Période de prestations introuvable." }, { status: 404 });
  }
  const timezone = actor.user?.timezone || "Africa/Kinshasa";
  const currentPeriod = weekPeriodForDate(currentDateKey(timezone));
  const isPastPeriod = submissionRecord.periodEnd.toISOString().slice(0, 10) < currentPeriod.periodEnd;
  if (isPastPeriod && !(await hasDtscIndividualPermission(session.userId, DTSC_SPECIAL_PERMISSIONS.SUBMIT_PAST_WORK_PERIOD))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "past_work_submission_denied", submissionId: id } });
    return NextResponse.json({
      error: "PAST_PERIOD_PERMISSION_REQUIRED",
      message: "La soumission d'une semaine passée exige une permission individuelle accordée dans Administration → Accès RBAC.",
    }, { status: 403 });
  }

  try {
    const submission = await submitWorkSubmission(actor, id, parsed.data.confirmScheduleConflicts);
    const auditAction = submission.revision > 0 ? "WORK_SUBMISSION_RESUBMITTED" : "WORK_SUBMISSION_SUBMITTED";
    await writeAuditLog({ userId: session.userId, action: auditAction, entity: "DtscWorkSubmission", entityId: submission.id, request: req, metadata: { employeeId: actor.id, declaredMinutes: submission.declaredMinutes, revision: submission.revision, pastPeriod: isPastPeriod } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    const status = isWorkPrestationError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "work_submission_submit_failed", code: isWorkPrestationError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isWorkPrestationError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Soumission impossible." }, { status });
  }
}
