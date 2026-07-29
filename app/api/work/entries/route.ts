import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  createWorkEntry,
  getWorkActor,
  isWorkPrestationError,
  listOwnEntries,
  serializeWorkEntry,
  weekPeriodForDate,
  workEntryCreateSchema,
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
    return NextResponse.json({ error: "Forbidden", message: "Les prestations de travail sont réservées à l’espace interne DTSC." }, { status: 403 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required", message: "Aucun dossier collaborateur actif n’est rattaché à ce compte." }, { status: 403 });
  }
  const periodDate = new URL(req.url).searchParams.get("periodDate") || undefined;
  if (periodDate && !/^\d{4}-\d{2}-\d{2}$/.test(periodDate)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid period", message: "La date de période est invalide." }, { status: 400 });
  }
  const result = await listOwnEntries(actor, periodDate);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "work_entry_origin_denied" } });
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
  const limited = await rateLimit(getRateLimitKey(req, `work-entry-create:${session.userId}`), 160, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de prestations enregistrées sur une courte période." }, { status: 429 });
  }
  const parsed = workEntryCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "La prestation est invalide." }, { status: 400 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }
  try {
    const period = weekPeriodForDate(parsed.data.workDate);
    const existingSubmission = await prisma.dtscWorkSubmission.findUnique({
      where: {
        employeeId_periodStart_periodEnd: {
          employeeId: actor.id,
          periodStart: new Date(`${period.periodStart}T00:00:00.000Z`),
          periodEnd: new Date(`${period.periodEnd}T00:00:00.000Z`),
        },
      },
      select: { id: true },
    });
    const entry = await createWorkEntry(actor, parsed.data);
    if (!existingSubmission && entry.submissionId) {
      await writeAuditLog({ userId: session.userId, action: "WORK_SUBMISSION_CREATED", entity: "DtscWorkSubmission", entityId: entry.submissionId, request: req, metadata: { employeeId: actor.id, periodStart: period.periodStart, periodEnd: period.periodEnd, source: "first_work_entry" } });
    }
    await writeAuditLog({ userId: session.userId, action: "WORK_ENTRY_CREATED", entity: "DtscWorkEntry", entityId: entry.id, request: req, metadata: { employeeId: actor.id, workedMinutes: entry.workedMinutes } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, entry: serializeWorkEntry(entry) }, { status: 201 });
  } catch (error) {
    const status = isWorkPrestationError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: "work_entry_create_failed", code: isWorkPrestationError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isWorkPrestationError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Création impossible." }, { status });
  }
}
