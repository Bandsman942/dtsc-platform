import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canUseFeature } from "@/lib/billing/entitlements";
import { assertGroupMemberForSession, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { publishCollaborationCallEvent } from "@/lib/collaboration-call-event-inbox";
import { expireMissedCollaborationCalls } from "@/lib/collaboration-calls";
import { generateLiveKitParticipantToken, isLiveKitConfigured, liveKitUrl } from "@/lib/livekit-service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationCallParticipantSchema } from "@/lib/validators";
import { isCollaborationBlocked } from "@/lib/standard-collaboration";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaboration_call_join_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-call-join:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de tentatives pour rejoindre un appel sur une courte période." }, { status: 429 });
  }

  const { id } = await params;
  await expireMissedCollaborationCalls();
  const call = await prisma.collaborationGroupCall.findUnique({ where: { id } });
  if (!call || (call.status !== "RINGING" && call.status !== "ACTIVE")) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Aucun appel actif n'a été trouvé." }, { status: 404 });
  }
  const member = await assertGroupMemberForSession(call.groupId, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.group.groupType === "DIRECT") {
    const otherMember = await prisma.collaborationGroupMember.findFirst({
      where: { groupId: call.groupId, userId: { not: session.userId }, status: "ACTIVE" },
      select: { userId: true },
    });
    if (!otherMember || await isCollaborationBlocked(session.userId, otherMember.userId)) {
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "collaboration_call_join_blocked" } });
      return NextResponse.json({ error: "BLOCKED", message: "Cet appel n’est pas autorisé." }, { status: 403 });
    }
  }
  if (member.group.organizationId && !["CROSS_ORGANIZATION", "PRIVATE_NETWORK", "DTSC_SUPPORT"].includes(member.group.groupType)) {
    const featureAccess = await canUseFeature(member.group.organizationId, "collaboration-calls");
    if (!featureAccess.allowed) {
      await writeApiLog({ request: req, statusCode: featureAccess.code === "PLAN_REQUIRED" || featureAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403, userId: session.userId, startedAt });
      return NextResponse.json({ error: featureAccess.code, message: featureAccess.message }, { status: featureAccess.code === "PLAN_REQUIRED" || featureAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403 });
    }
  }
  if (!isLiveKitConfigured()) {
    await writeApiLog({ request: req, statusCode: 503, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Les appels ne sont pas encore configurés pour cet environnement." }, { status: 503 });
  }

  const parsed = collaborationCallParticipantSchema.safeParse(await req.json().catch(() => ({})));
  const microphoneEnabled = parsed.success ? parsed.data.microphoneEnabled ?? true : true;
  const cameraEnabled = parsed.success ? parsed.data.cameraEnabled ?? call.callType === "VIDEO" : call.callType === "VIDEO";
  const token = generateLiveKitParticipantToken({
    roomName: call.roomName,
    identity: session.userId,
    name: session.name,
    canPublish: true,
    canSubscribe: true,
  });

  const eventId = await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCall.update({ where: { id: call.id }, data: { status: "ACTIVE", acceptedAt: call.acceptedAt || new Date() } });
    await tx.collaborationGroupCallParticipant.upsert({
      where: { callId_userId: { callId: call.id, userId: session.userId } },
      update: { status: "JOINED", joinedAt: new Date(), leftAt: null, microphoneEnabled, cameraEnabled },
      create: { callId: call.id, userId: session.userId, status: "JOINED", joinedAt: new Date(), microphoneEnabled, cameraEnabled },
    });
    const event = await tx.collaborationGroupCallEvent.create({
      data: {
        callId: call.id,
        groupId: call.groupId,
        meetingId: call.meetingId,
        userId: session.userId,
        eventType: "CALL_JOINED",
        message: `${session.name} a rejoint l'appel.`,
      },
      select: { id: true },
    });
    return event.id;
  });
  await publishCollaborationCallEvent(eventId);
  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: `${session.name} a rejoint l'appel.` });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.join", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.call.join", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, token, livekitUrl: liveKitUrl() });
}
