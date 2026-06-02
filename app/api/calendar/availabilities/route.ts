import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canManageCollaboratorCalendar, collaboratorAvailabilityWhere, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { internalCalendarAvailabilitySchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const collaboratorId = new URL(req.url).searchParams.get("collaboratorId") || "";
  const where = collaboratorAvailabilityWhere(context, collaboratorId);

  const availabilities = await prisma.collaboratorAvailability.findMany({
    where,
    orderBy: [{ specificDate: "asc" }, { recurrenceStart: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
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
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Le calendrier interne est réservé aux collaborateurs autorisés de l'espace actif." }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = internalCalendarAvailabilitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La disponibilité est invalide." }, { status: 400 });
  }

  if (!canManageCollaboratorCalendar(context, parsed.data.collaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cette disponibilité." }, { status: 403 });
  }
  if (!(await validateCalendarCollaborators(context, [parsed.data.collaboratorId]))) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid collaborator", message: "Ce collaborateur n'appartient pas à l'organisation active." }, { status: 400 });
  }

  const availability = await prisma.collaboratorAvailability.create({
    data: {
      ...parsed.data,
      organizationId: context.activeOrganizationId,
      dayOfWeek: parsed.data.dayOfWeek ?? null,
      specificDate: parsed.data.specificDate || null,
      notes: parsed.data.notes || null,
      recurrenceStart: parsed.data.recurrenceStart || null,
      recurrenceUntil: parsed.data.recurrenceUntil || null,
      recurrenceInterval: parsed.data.recurrenceInterval || 1,
      createdBy: session.userId,
    },
  });

  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_AVAILABILITY_CREATED", entity: "CollaboratorAvailability", entityId: availability.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, availability }, { status: 201 });
}
