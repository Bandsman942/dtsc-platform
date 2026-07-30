import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
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

  if (call.status === "ENDED") {
    const followUp = call.meetingId ? await prisma.collaborationMeetingMinutesPublication.findUnique({ where: { callId: call.id } }) : null;
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "collaboration_call_end_idempotent" } });
    return NextResponse.json({ ok: true, meetingFollowUp: followUp });
  }

  const endedAt = new Date();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000));
  const followUp = await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCall.update({ where: { id: call.id }, data: { status: "ENDED", endedAt, durationSeconds } });
    await tx.collaborationGroupCallParticipant.updateMany({
      where: { callId: call.id, status: { in: ["INVITED", "JOINED"] } },
      data: { status: "LEFT", leftAt: endedAt },
    });
    await tx.collaborationGroupCallEvent.create({
      data: {
        callId: call.id,
        groupId: call.groupId,
        meetingId: call.meetingId,
        userId: session.userId,
        eventType: "CALL_ENDED",
        message: "L'appel est terminé.",
      },
    });

    if (!call.meetingId) return null;

    await tx.cooMeeting.updateMany({ where: { id: call.meetingId, activeCallId: call.id }, data: { activeCallId: null } });
    await tx.collaborationMeetingLink.updateMany({
      where: { meetingId: call.meetingId },
      data: { status: "COMPLETED", lastCallId: call.id },
    });

    const existing = await tx.collaborationMeetingMinutesPublication.findUnique({ where: { callId: call.id } });
    if (existing) return existing;

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
    return tx.collaborationMeetingMinutesPublication.create({
      data: {
        meetingId: call.meetingId,
        callId: call.id,
        groupId: call.groupId,
        promptMessageId: prompt.id,
        status: "PENDING",
      },
    });
  });

  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: "L'appel est terminé." });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.end", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.call.end", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, meetingFollowUp: followUp });
}
