import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getWorkActor, isWorkPrestationError, reviewWorkSubmission, workReviewSchema } from "@/lib/work-prestations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "ceo_work_review_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireAdminBlockAccess("ceo");
  if (access.response) {
    await writeApiLog({ request: req, statusCode: access.response.status, startedAt });
    return access.response;
  }
  const session = access.session;
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `ceo-work-review:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = workReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Décision invalide." }, { status: 400 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const submission = await reviewWorkSubmission({ actor, submissionId: id, action: parsed.data.action, comment: parsed.data.comment, expectedReviewerCode: "CEO" });
    const auditAction = parsed.data.action === "APPROVED"
      ? "WORK_SUBMISSION_APPROVED"
      : parsed.data.action === "CHANGES_REQUESTED"
        ? "WORK_SUBMISSION_CHANGES_REQUESTED"
        : "WORK_SUBMISSION_REJECTED";
    await writeAuditLog({ userId: session.userId, action: auditAction, entity: "DtscWorkSubmission", entityId: id, request: req, metadata: { reviewerEmployeeId: actor.id, declaredMinutes: submission.declaredMinutes, validatedMinutes: submission.validatedMinutes } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    const status = isWorkPrestationError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "ceo_work_review_failed", code: isWorkPrestationError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isWorkPrestationError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Décision impossible." }, { status });
  }
}
