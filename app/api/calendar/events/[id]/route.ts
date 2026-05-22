import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  canAccessInternalCalendar,
  calendarEventInclude,
  canManageCollaboratorCalendar,
  detectCalendarConflicts,
  getCalendarContext,
  internalCalendarAccessWhere,
  notifyCalendarParticipants,
} from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { internalCalendarEventUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
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

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const event = await prisma.internalCalendarEvent.findFirst({
    where: { AND: [internalCalendarAccessWhere(context), { id }] },
    include: calendarEventInclude(),
  });
  if (!event) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ event });
}

export async function PATCH(req: Request, { params }: Params) {
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

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const existing = await prisma.internalCalendarEvent.findFirst({
    where: { AND: [internalCalendarAccessWhere(context), { id }] },
    include: { participants: true },
  });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageCollaboratorCalendar(context, existing.ownerCollaboratorId) && existing.createdBy !== session.userId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier cet événement." }, { status: 403 });
  }

  const parsed = internalCalendarEventUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Les données de l'événement sont invalides." }, { status: 400 });
  }

  const { participantIds, allowConflicts, ...data } = parsed.data;
  const ownerCollaboratorId = data.ownerCollaboratorId || existing.ownerCollaboratorId || context.employee?.id || "";
  if (!canManageCollaboratorCalendar(context, ownerCollaboratorId)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas modifier ce planning." }, { status: 403 });
  }

  const allParticipantIds = participantIds
    ? [...new Set([ownerCollaboratorId, ...participantIds].filter(Boolean))]
    : existing.participants.map((participant) => participant.collaboratorId);
  const startDateTime = data.startDateTime || existing.startDateTime;
  const endDateTime = data.endDateTime || existing.endDateTime;
  const conflicts = await detectCalendarConflicts({ participantIds: allParticipantIds, startDateTime, endDateTime, excludeEventId: id });
  const hasBlockingConflict = conflicts.some((conflict) => conflict.severity === "Bloquant");
  if ((hasBlockingConflict && !context.canOverrideConflicts) || (conflicts.length > 0 && !allowConflicts)) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
    return NextResponse.json({ error: "CALENDAR_CONFLICT", message: "Conflit de disponibilité détecté.", conflicts }, { status: 409 });
  }

  const event = await prisma.$transaction(async (tx) => {
    if (participantIds) {
      await tx.internalCalendarEventParticipant.deleteMany({ where: { eventId: id } });
    }
    await tx.internalCalendarConflict.deleteMany({ where: { eventId: id, resolved: false } });
    return tx.internalCalendarEvent.update({
      where: { id },
      data: {
        ...data,
        ownerCollaboratorId: ownerCollaboratorId || null,
        physicalLocation: data.physicalLocation || undefined,
        meetingLink: data.meetingLink || undefined,
        participants: participantIds
          ? {
              create: allParticipantIds.map((collaboratorId) => ({
                collaboratorId,
                role: collaboratorId === ownerCollaboratorId ? "Organisateur" : "Participant",
              })),
            }
          : undefined,
        conflicts: {
          create: conflicts.map((conflict) => ({
            collaboratorId: conflict.collaboratorId,
            conflictType: conflict.conflictType,
            conflictWithEventId: conflict.conflictWithEventId || null,
            conflictWithAvailabilityId: conflict.conflictWithAvailabilityId || null,
            severity: conflict.severity,
            message: conflict.message,
          })),
        },
      },
      include: calendarEventInclude(),
    });
  });

  await notifyCalendarParticipants({ participantIds: allParticipantIds, title: "Événement calendrier modifié", body: event.title, targetUrl: `/calendar?event=${event.id}` });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_EVENT_UPDATED", entity: "InternalCalendarEvent", entityId: event.id, request: req, metadata: { conflictCount: conflicts.length } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
  return NextResponse.json({ ok: true, event });
}

export async function DELETE(req: Request, { params }: Params) {
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

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role });
  const existing = await prisma.internalCalendarEvent.findFirst({ where: { AND: [internalCalendarAccessWhere(context), { id }] } });
  if (!existing) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageCollaboratorCalendar(context, existing.ownerCollaboratorId) && existing.createdBy !== session.userId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous ne pouvez pas annuler cet événement." }, { status: 403 });
  }

  const event = await prisma.internalCalendarEvent.update({
    where: { id },
    data: { status: "Annulé", deletedAt: new Date() },
  });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_EVENT_CANCELED", entity: "InternalCalendarEvent", entityId: event.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
