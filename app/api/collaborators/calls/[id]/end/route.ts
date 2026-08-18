import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { publishCollaborationCallEvent } from "@/lib/collaboration-call-event-inbox";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaboration_call_end_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-call-end:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de tentatives de terminaison d'appel sur une courte période." }, { status: 429 });
  }

  const { id } = await params;
  const call = await prisma.collaborationGroupCall.findUnique({ where: { id } });
  if (!call) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Appel introuvable." }, { status: 404 });
  }
  const member = await assertGroupMemberForSession(call.groupId, session);
  if (!member || (call.startedById !== session.userId && !canManageGroup(member, session.role))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (["ENDED", "CANCELLED", "REJECTED", "MISSED", "FAILED"].includes(call.status)) {
    const followUp = call.meetingId ? await prisma.collaborationMeetingMinutesPublication.findUnique({ where: { callId: call.id } }) : null;
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "collaboration_call_end_idempotent" } });
    return NextResponse.json({ ok: true, meetingFollowUp: followUp });
  }

  const endedAt = new Date();
  const cancelledBeforeAnswer = call.status === "RINGING" && !call.acceptedAt;
  const finalStatus = cancelledBeforeAnswer ? "CANCELLED" : "ENDED";
  const eventType = cancelledBeforeAnswer ? "CALL_CANCELLED" : "CALL_ENDED";
  const eventMessage = cancelledBeforeAnswer ? "L’appel a été annulé." : "L’appel est terminé.";
  const activeStartedAt = call.acceptedAt || call.startedAt;
  const durationSeconds = cancelledBeforeAnswer ? 0 : Math.max(0, Math.round((endedAt.getTime() - activeStartedAt.getTime()) / 1000));
  const result = await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCall.update({ where: { id: call.id }, data: { status: finalStatus, endedAt, cancelledAt: cancelledBeforeAnswer ? endedAt : null, durationSeconds } });
    await tx.collaborationGroupCallParticipant.updateMany({
      where: { callId: call.id, status: { in: ["INVITED", "JOINED"] } },
      data: { status: "LEFT", leftAt: endedAt },
    });
    const event = await tx.collaborationGroupCallEvent.create({
      data: {
        callId: call.id,
        groupId: call.groupId,
        meetingId: call.meetingId,
        userId: session.userId,
        eventType,
        message: eventMessage,
      },
      select: { id: true },
    });

    if (!call.meetingId) return { followUp: null, eventId: event.id };

    await tx.cooMeeting.updateMany({ where: { id: call.meetingId, activeCallId: call.id }, data: { activeCallId: null } });
    if (cancelledBeforeAnswer) {
      await tx.collaborationMeetingLink.updateMany({
        where: { meetingId: call.meetingId },
        data: { status: "SCHEDULED", lastCallId: call.id },
      });
      return { followUp: null, eventId: event.id };
    }
    await tx.collaborationMeetingLink.updateMany({
      where: { meetingId: call.meetingId },
      data: { status: "COMPLETED", lastCallId: call.id },
    });

    const existing = await tx.collaborationMeetingMinutesPublication.findUnique({ where: { callId: call.id } });
    if (existing) return { followUp: existing, eventId: event.id };

    const meeting = await tx.cooMeeting.findUnique({ where: { id: call.meetingId }, select: { title: true } });
    const prompt = await tx.collaborationGroupMessage.create({
      data: {
        groupId: call.groupId,
        authorId: session.userId,
        content: `Réunion « ${meeting?.title || "COO"} » terminée. Le responsable du compte-rendu ou un administrateur peut maintenant rédiger le compte-rendu directement depuis cette conversation.`,
        messageType: "MEETING_MINUTES_PROMPT",
        status: "SENT",
      },
    });
    const followUp = await tx.collaborationMeetingMinutesPublication.create({
      data: {
        meetingId: call.meetingId,
        callId: call.id,
        groupId: call.groupId,
        promptMessageId: prompt.id,
        status: "PENDING",
      },
    });
    return { followUp, eventId: event.id };
  });

  await publishCollaborationCallEvent(result.eventId);
  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: eventMessage });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: cancelledBeforeAnswer ? "call.cancel" : "call.end", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: cancelledBeforeAnswer ? "collaboration.call.cancel" : "collaboration.call.end", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, meetingFollowUp: result.followUp });
}
