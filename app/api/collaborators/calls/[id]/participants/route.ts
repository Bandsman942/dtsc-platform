import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationCallParticipantSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaboration_call_participant_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);

  const limited = await rateLimit(getRateLimitKey(req, `collaboration-call-participant:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de changements d'état d'appel sur une courte période." }, { status: 429 });
  }

  const { id } = await params;
  const call = await prisma.collaborationGroupCall.findUnique({
    where: { id },
    select: { id: true, groupId: true, meetingId: true, status: true },
  });
  if (!call || (call.status !== "RINGING" && call.status !== "ACTIVE")) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Aucun appel actif n'a été trouvé." }, { status: 404 });
  }

  const member = await assertGroupMemberForSession(call.groupId, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = collaborationCallParticipantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "État d'appel invalide." }, { status: 400 });
  }

  const currentParticipant = await prisma.collaborationGroupCallParticipant.findUnique({
    where: { callId_userId: { callId: call.id, userId: session.userId } },
    select: { microphoneEnabled: true, cameraEnabled: true },
  });
  if (!currentParticipant) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nextMicrophoneEnabled = parsed.data.microphoneEnabled ?? currentParticipant.microphoneEnabled;
  const nextCameraEnabled = parsed.data.cameraEnabled ?? currentParticipant.cameraEnabled;
  const microphoneChanged = nextMicrophoneEnabled !== currentParticipant.microphoneEnabled;

  await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCallParticipant.update({
      where: { callId_userId: { callId: call.id, userId: session.userId } },
      data: {
        microphoneEnabled: nextMicrophoneEnabled,
        cameraEnabled: nextCameraEnabled,
      },
    });

    if (microphoneChanged) {
      await tx.collaborationGroupCallEvent.create({
        data: {
          callId: call.id,
          groupId: call.groupId,
          meetingId: call.meetingId,
          userId: session.userId,
          eventType: nextMicrophoneEnabled ? "PARTICIPANT_UNMUTED" : "PARTICIPANT_MUTED",
          message: nextMicrophoneEnabled ? `${session.name} a réactivé son micro.` : `${session.name} a coupé son micro.`,
        },
      });
    }
  });

  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.participant.update", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
