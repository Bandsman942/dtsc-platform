import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { generateLiveKitParticipantToken, isLiveKitConfigured, liveKitUrl } from "@/lib/livekit-service";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationCallParticipantSchema } from "@/lib/validators";

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

  await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCall.update({ where: { id: call.id }, data: { status: "ACTIVE" } });
    await tx.collaborationGroupCallParticipant.upsert({
      where: { callId_userId: { callId: call.id, userId: session.userId } },
      update: { status: "JOINED", joinedAt: new Date(), leftAt: null, microphoneEnabled, cameraEnabled },
      create: { callId: call.id, userId: session.userId, status: "JOINED", joinedAt: new Date(), microphoneEnabled, cameraEnabled },
    });
    await tx.collaborationGroupCallEvent.create({
      data: {
        callId: call.id,
        groupId: call.groupId,
        meetingId: call.meetingId,
        userId: session.userId,
        eventType: "CALL_JOINED",
        message: `${session.name} a rejoint l'appel.`,
      },
    });
  });
  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: `${session.name} a rejoint l'appel.` });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.join", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.call.join", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, token, livekitUrl: liveKitUrl() });
}
