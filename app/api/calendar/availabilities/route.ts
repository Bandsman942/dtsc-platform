import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { internalCalendarAvailabilitySchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role })) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs DTSC autorisés." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const collaboratorId = new URL(req.url).searchParams.get("collaboratorId") || "";
  const where = context.canViewGlobal || context.canManagePeople
    ? { deletedAt: null, ...(collaboratorId ? { collaboratorId } : {}) }
    : { deletedAt: null, collaboratorId: context.employee?.id || "__no_employee__" };

  const availabilities = await prisma.collaboratorAvailability.findMany({
    where,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    take: 300,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ availabilities });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role })) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs DTSC autorisés." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const parsed = internalCalendarAvailabilitySchema.safeParse(await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  }

  if (!canManageCollaboratorCalendar(context, parsed.data.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cette disponibilité." }, { status: 403 });
  }

  const availability = await prisma.collaboratorAvailability.create({
    data: {
      ...parsed.data,
      notes: parsed.data.notes || null,
      recurrenceUntil: parsed.data.recurrenceUntil || null,
      createdBy: session.userId,
    },
  });

  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_CREATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, availability }, { status: 201 });
}
