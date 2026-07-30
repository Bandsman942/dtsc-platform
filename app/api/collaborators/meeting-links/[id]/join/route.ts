import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canUseFeature } from "@/lib/billing/entitlements";
import { assertGroupMemberForSession, createGroupSystemMessage, groupMemberUserIds, writeGroupAudit } from "@/lib/collaboration";
import { meetingLinkCanJoin } from "@/lib/collaboration-meeting-links";
import { buildLiveKitRoomName } from "@/lib/livekit-service";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "scheduled_meeting_join_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `scheduled-meeting-join:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de tentatives de connexion à une réunion." }, { status: 429 });
  }

  const { id } = await params;
  const link = await prisma.collaborationMeetingLink.findUnique({ where: { id } });
  if (!link) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Lien de réunion introuvable." }, { status: 404 });
  }

  const callType = link.callType === "AUDIO" || link.callType === "VIDEO" ? link.callType : null;
  if (!callType) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt, metadata: { reason: "invalid_meeting_call_type" } });
    return NextResponse.json({ message: "Le type d’appel de cette réunion est invalide." }, { status: 409 });
  }

  const member = await assertGroupMemberForSession(link.groupId, session);
  if (!member || member.group.meetingId !== link.meetingId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!meetingLinkCanJoin(link)) {
    const statusCode = link.status === "CANCELED" || link.status === "COMPLETED" ? 409 : 425;
    await writeApiLog({ request: req, statusCode, userId: session.userId, startedAt, metadata: { meetingId: link.meetingId, linkStatus: link.status } });
    return NextResponse.json({
      error: statusCode === 425 ? "MEETING_NOT_OPEN" : "MEETING_CLOSED",
      message: statusCode === 425 ? "Le lien sera actif à l’heure planifiée de la réunion." : "Cette réunion n’accepte plus de nouvelle connexion.",
      scheduledAt: link.scheduledAt,
    }, { status: statusCode });
  }

  if (member.group.organizationId && !["CROSS_ORGANIZATION", "PRIVATE_NETWORK", "DTSC_SUPPORT"].includes(member.group.groupType)) {
    const featureAccess = await canUseFeature(member.group.organizationId, "collaboration-calls");
    if (!featureAccess.allowed) {
      const statusCode = featureAccess.code === "PLAN_REQUIRED" || featureAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
      await writeApiLog({ request: req, statusCode, userId: session.userId, startedAt });
      return NextResponse.json({ error: featureAccess.code, message: featureAccess.message }, { status: statusCode });
    }
  }

  const meeting = await prisma.cooMeeting.findFirst({
    where: { id: link.meetingId, collaborationGroupId: link.groupId, status: { not: "CANCELED" } },
    select: { id: true, title: true, meetingMode: true },
  });
  if (!meeting || meeting.meetingMode !== callType) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ message: "La réunion planifiée a été modifiée. Rechargez la conversation." }, { status: 409 });
  }

  const existingCall = await prisma.collaborationGroupCall.findFirst({
    where: { groupId: link.groupId, meetingId: link.meetingId, status: { in: ["RINGING", "ACTIVE"] } },
    orderBy: { startedAt: "desc" },
  });
  if (existingCall) {
    await prisma.collaborationMeetingLink.update({ where: { id: link.id }, data: { status: "ACTIVE", lastCallId: existingCall.id } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { action: "scheduled_meeting_join_existing", callId: existingCall.id } });
    return NextResponse.json({ ok: true, call: existingCall, created: false });
  }

  const memberUserIds = await groupMemberUserIds(link.groupId);
  const roomName = buildLiveKitRoomName({ groupId: link.groupId, meetingId: link.meetingId, callType });
  const content = `${session.name} a démarré la réunion ${callType === "VIDEO" ? "vidéo" : "audio"} planifiée.`;
  const call = await prisma.$transaction(async (tx) => {
    const createdCall = await tx.collaborationGroupCall.create({
      data: {
        groupId: link.groupId,
        meetingId: link.meetingId,
        callType,
        provider: "LIVEKIT",
        roomName,
        status: "RINGING",
        startedById: session.userId,
        participants: {
          create: memberUserIds.map((userId) => ({
            userId,
            status: userId === session.userId ? "JOINED" : "INVITED",
            joinedAt: userId === session.userId ? new Date() : null,
            cameraEnabled: callType === "VIDEO" && userId === session.userId,
          })),
        },
        events: {
          create: {
            groupId: link.groupId,
            meetingId: link.meetingId,
            userId: session.userId,
            eventType: "CALL_STARTED",
            message: content,
          },
        },
      },
    });
    await tx.cooMeeting.update({ where: { id: link.meetingId }, data: { activeCallId: createdCall.id, status: "HELD" } });
    await tx.collaborationMeetingLink.update({ where: { id: link.id }, data: { status: "ACTIVE", lastCallId: createdCall.id } });
    return createdCall;
  });

  await createGroupSystemMessage({ groupId: link.groupId, actorId: session.userId, content });
  await notifyUsers({
    userIds: memberUserIds.filter((userId) => userId !== session.userId),
    title: callType === "VIDEO" ? "Réunion vidéo DTSC démarrée" : "Réunion audio DTSC démarrée",
    body: `${meeting.title} est maintenant ouverte.`,
    type: "COLLABORATION",
    targetUrl: `/collaborators?groupId=${encodeURIComponent(link.groupId)}&joinCall=${encodeURIComponent(call.id)}`,
    organizationId: member.group.organizationId,
  }).catch(() => null);
  await writeGroupAudit({ groupId: link.groupId, actorId: session.userId, action: "meeting.join_link.start", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.meeting.join_link.start", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { meetingId: link.meetingId, callId: call.id } });
  return NextResponse.json({ ok: true, call, created: true }, { status: 201 });
}
