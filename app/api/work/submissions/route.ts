import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  ensureDraftSubmissionForDate,
  getOwnWorkState,
  getWorkActor,
  serializeSubmission,
  workSubmissionCreateSchema,
} from "@/lib/work-prestations";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  const rawLimit = Number(new URL(req.url).searchParams.get("limit") || 12);
  const state = await getOwnWorkState(actor, Number.isFinite(rawLimit) ? rawLimit : 12);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "work_submission_origin_denied" } });
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
  const limited = await rateLimit(getRateLimitKey(req, `work-submission-create:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = workSubmissionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Période invalide." }, { status: 400 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  const submission = await ensureDraftSubmissionForDate(actor, parsed.data.periodDate);
  await writeAuditLog({ userId: session.userId, action: "WORK_SUBMISSION_CREATED", entity: "DtscWorkSubmission", entityId: submission.id, request: req, metadata: { employeeId: actor.id } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, submission: serializeSubmission(submission) });
}
