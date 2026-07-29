import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  deleteWorkEntry,
  getWorkActor,
  isWorkPrestationError,
  serializeWorkEntry,
  updateWorkEntry,
  workEntryUpdateSchema,
} from "@/lib/work-prestations";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutateEntry(req, await params, "PATCH");
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return mutateEntry(req, await params, "DELETE");
}

async function mutateEntry(req: Request, { id }: { id: string }, method: "PATCH" | "DELETE") {
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
  const limited = await rateLimit(getRateLimitKey(req, `work-entry-${method.toLowerCase()}:${session.userId}`), 160, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const actor = await getWorkActor(session.userId);
  if (!actor) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Employee required" }, { status: 403 });
  }

  try {
    if (method === "DELETE") {
      const entry = await deleteWorkEntry(actor, id);
      await writeAuditLog({ userId: session.userId, action: "WORK_ENTRY_DELETED", entity: "DtscWorkEntry", entityId: entry.id, request: req, metadata: { employeeId: actor.id, softDelete: true } });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
      return NextResponse.json({ ok: true });
    }

    const parsed = workEntryUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "La prestation est invalide." }, { status: 400 });
    }
    const entry = await updateWorkEntry(actor, id, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "WORK_ENTRY_UPDATED", entity: "DtscWorkEntry", entityId: entry.id, request: req, metadata: { employeeId: actor.id, workedMinutes: entry.workedMinutes } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, entry: serializeWorkEntry(entry) });
  } catch (error) {
    const status = isWorkPrestationError(error) ? error.status : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { action: `work_entry_${method.toLowerCase()}_failed`, code: isWorkPrestationError(error) ? error.code : "UNKNOWN" } });
    return NextResponse.json({ error: isWorkPrestationError(error) ? error.code : "Internal error", message: error instanceof Error ? error.message : "Opération impossible." }, { status });
  }
}
