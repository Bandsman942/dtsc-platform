import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CALENDAR_PARTICIPANT_STATUS, CALENDAR_RESPONSE } from "@/lib/calendar-participation";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, detectCalendarConflicts, getCalendarContext } from "@/lib/internal-calendar";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const responseSchema = z.object({
  response: z.enum(["ACCEPT", "DECLINE"]),
  confirmConflicts: z.boolean().default(false),
  comment: z.string().max(800).optional().or(z.literal("")),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-invitation-response:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await canUseInternalCalendarFeature(context);
  if (!access.allowed) {
    const status = access.code === "PLAN_REQUIRED" || access.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    return NextResponse.json({ error: access.code, message: access.message }, { status });
  }
  const parsed = responseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Réponse d'invitation invalide." }, { status: 400 });

  const { id } = await params;
  const event = await prisma.internalCalendarEvent.findFirst({
    where: { id, organizationId: context.activeOrganizationId, deletedAt: null },
    include: { participants: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (event.ownerCollaboratorId === context.calendarCollaboratorId || event.createdBy === session.userId) {
    return NextResponse.json({ error: "OWNER_ALREADY_ACCEPTED", message: "Le créateur est déjà responsable de cet événement." }, { status: 400 });
  }
  const participant = event.participants.find((item) => item.collaboratorId === context.calendarCollaboratorId);
  if (!participant || participant.participantStatus !== CALENDAR_PARTICIPANT_STATUS.ACTIVE) {
    return NextResponse.json({ error: "Forbidden", message: "Cette invitation ne vous est pas destinée." }, { status: 403 });
  }

  let conflicts: Awaited<ReturnType<typeof detectCalendarConflicts>> = [];
  if (parsed.data.response === "ACCEPT") {
    conflicts = await detectCalendarConflicts({
      context,
      participantIds: [context.calendarCollaboratorId],
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      excludeEventId: event.id,
    });
    const blocking = conflicts.some((conflict) => conflict.severity === "Bloquant");
    if (blocking || (conflicts.length && !parsed.data.confirmConflicts)) {
      await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { eventId: event.id, conflictCount: conflicts.length } });
      return NextResponse.json({
        error: blocking ? "BLOCKING_CALENDAR_CONFLICT" : "CALENDAR_CONFLICT_CONFIRMATION_REQUIRED",
        message: blocking
          ? "Vous ne pouvez pas accepter cet événement tant qu'un conflit bloquant subsiste."
          : "Des conflits ou avertissements existent. Confirmez après les avoir examinés.",
        conflicts,
      }, { status: 409 });
    }
  }

  const responseStatus = parsed.data.response === "ACCEPT" ? CALENDAR_RESPONSE.ACCEPTED : CALENDAR_RESPONSE.DECLINED;
  const participantStatus = parsed.data.response === "ACCEPT" ? CALENDAR_PARTICIPANT_STATUS.ACTIVE : CALENDAR_PARTICIPANT_STATUS.DECLINED;
  const updated = await prisma.internalCalendarEventParticipant.update({
    where: { id: participant.id },
    data: { responseStatus, participantStatus },
  });

  await notifyUsers({
    userIds: [event.createdBy].filter((userId): userId is string => Boolean(userId) && userId !== session.userId),
    title: parsed.data.response === "ACCEPT" ? "Invitation calendrier acceptée" : "Invitation calendrier refusée",
    body: `${event.title}${parsed.data.comment ? ` · ${parsed.data.comment}` : ""}`,
    type: "CALENDAR_INVITATION_RESPONSE",
    targetUrl: `/calendar?event=${event.id}`,
    organizationId: context.activeOrganizationId,
  });
  await writeAuditLog({
    userId: session.userId,
    action: parsed.data.response === "ACCEPT" ? "INTERNAL_CALENDAR_INVITATION_ACCEPTED" : "INTERNAL_CALENDAR_INVITATION_DECLINED",
    entity: "InternalCalendarEventParticipant",
    entityId: participant.id,
    request: req,
    metadata: { eventId: event.id, responseStatus, conflictCount: conflicts.length, comment: parsed.data.comment || null },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { eventId: event.id, responseStatus } });
  return NextResponse.json({ ok: true, participant: updated, conflicts });
}
