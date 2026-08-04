import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  canAccessInternalCalendar,
  calendarEventInclude,
  canUseInternalCalendarFeature,
  detectCalendarConflicts,
  getCalendarContext,
  notifyCalendarParticipants,
  validateCalendarCollaborators,
} from "@/lib/internal-calendar";
import {
  calendarEventAccessWhere,
  creatorParticipantCreate,
  invitedParticipantCreate,
} from "@/lib/calendar-participation";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { internalCalendarEventUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await canUseInternalCalendarFeature(context);
  if (!access.allowed) {
    const status = access.code === "PLAN_REQUIRED" || access.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    return NextResponse.json({ error: access.code, message: access.message }, { status });
  }
  const event = await prisma.internalCalendarEvent.findFirst({
    where: { AND: [calendarEventAccessWhere(context), { id }] },
    include: calendarEventInclude(),
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    event,
    capabilities: {
      canEdit: event.createdBy === session.userId && event.ownerCollaboratorId === context.calendarCollaboratorId,
      canDelete: event.createdBy === session.userId && event.ownerCollaboratorId === context.calendarCollaboratorId,
      canRespond: event.participants.some((participant) =>
        participant.collaboratorId === context.calendarCollaboratorId &&
        participant.role !== "Organisateur" &&
        participant.responseStatus === "En attente" &&
        participant.participantStatus === "Actif"
      ),
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-event-update:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'opérations calendrier sur une courte période." }, { status: 429 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await canUseInternalCalendarFeature(context);
  if (!access.allowed) {
    const status = access.code === "PLAN_REQUIRED" || access.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    return NextResponse.json({ error: access.code, message: access.message }, { status });
  }

  const existing = await prisma.internalCalendarEvent.findFirst({
    where: { id, organizationId: context.activeOrganizationId, deletedAt: null },
    include: { participants: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.createdBy !== session.userId || existing.ownerCollaboratorId !== context.calendarCollaboratorId) {
    return NextResponse.json({ error: "Forbidden", message: "Seul le créateur responsable peut modifier cet événement." }, { status: 403 });
  }

  const parsed = internalCalendarEventUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Les données de l'événement sont invalides." }, { status: 400 });
  const { participantIds, allowConflicts, ...data } = parsed.data;
  if (data.ownerCollaboratorId && data.ownerCollaboratorId !== existing.ownerCollaboratorId) {
    return NextResponse.json({ error: "OWNER_IMMUTABLE", message: "Le responsable d'un événement reste son créateur." }, { status: 400 });
  }

  const ownerCollaboratorId = existing.ownerCollaboratorId || context.calendarCollaboratorId;
  const requestedInvitees = participantIds
    ? [...new Set(participantIds.filter((participantId) => participantId && participantId !== ownerCollaboratorId))]
    : existing.participants.filter((participant) => participant.role !== "Organisateur" && participant.participantStatus !== "Retiré").map((participant) => participant.collaboratorId);
  const allCollaboratorIds = [ownerCollaboratorId, ...requestedInvitees];
  if (!(await validateCalendarCollaborators(context, allCollaboratorIds))) {
    return NextResponse.json({ error: "Invalid participants", message: "Tous les collaborateurs doivent appartenir à l'organisation active." }, { status: 400 });
  }

  const startDateTime = data.startDateTime || existing.startDateTime;
  const endDateTime = data.endDateTime || existing.endDateTime;
  const conflicts = await detectCalendarConflicts({ context, participantIds: allCollaboratorIds, startDateTime, endDateTime, excludeEventId: id });
  const hasBlockingConflict = conflicts.some((conflict) => conflict.severity === "Bloquant");
  if ((hasBlockingConflict && !context.canOverrideConflicts) || (conflicts.length > 0 && !allowConflicts)) {
    return NextResponse.json({ error: "CALENDAR_CONFLICT", message: "Conflit de disponibilité détecté pour le responsable ou un participant.", conflicts }, { status: 409 });
  }

  const existingByCollaborator = new Map(existing.participants.map((participant) => [participant.collaboratorId, participant]));
  const newlyInvitedIds = requestedInvitees.filter((participantId) => !existingByCollaborator.has(participantId));
  const event = await prisma.$transaction(async (tx) => {
    if (participantIds) {
      await tx.internalCalendarEventParticipant.deleteMany({ where: { eventId: id } });
    }
    await tx.internalCalendarConflict.deleteMany({ where: { eventId: id, resolved: false } });
    return tx.internalCalendarEvent.update({
      where: { id },
      data: {
        ...data,
        ownerCollaboratorId,
        physicalLocation: data.physicalLocation ?? undefined,
        meetingLink: data.meetingLink ?? undefined,
        participants: participantIds
          ? {
              create: [
                creatorParticipantCreate(ownerCollaboratorId),
                ...requestedInvitees.map((participantId) => {
                  const previous = existingByCollaborator.get(participantId);
                  return previous
                    ? {
                        collaboratorId: participantId,
                        role: "Participant",
                        participantStatus: previous.participantStatus,
                        responseStatus: previous.responseStatus,
                      }
                    : invitedParticipantCreate(participantId);
                }),
              ],
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

  if (newlyInvitedIds.length) {
    await notifyCalendarParticipants({
      context,
      participantIds: newlyInvitedIds,
      title: "Invitation à un événement calendrier",
      body: `${event.title} · acceptez ou refusez votre participation.`,
      targetUrl: `/calendar?invitation=${event.id}`,
    });
  }
  await writeAuditLog({
    userId: session.userId,
    action: "INTERNAL_CALENDAR_EVENT_UPDATED",
    entity: "InternalCalendarEvent",
    entityId: event.id,
    request: req,
    metadata: { conflictCount: conflicts.length, newlyInvitedCount: newlyInvitedIds.length, ownerImmutable: true },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { conflictCount: conflicts.length } });
  return NextResponse.json({ ok: true, event });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-event-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.internalCalendarEvent.findFirst({ where: { id, organizationId: context.activeOrganizationId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.createdBy !== session.userId || existing.ownerCollaboratorId !== context.calendarCollaboratorId) {
    return NextResponse.json({ error: "Forbidden", message: "Seul le créateur responsable peut annuler cet événement." }, { status: 403 });
  }

  const event = await prisma.internalCalendarEvent.update({ where: { id }, data: { status: "Annulé", deletedAt: new Date() } });
  await writeAuditLog({ userId: session.userId, action: "INTERNAL_CALENDAR_EVENT_CANCELED", entity: "InternalCalendarEvent", entityId: event.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
