import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaboration_call_leave_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-call-leave:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de changements d'appel sur une courte période." }, { status: 429 });
  }

  const { id } = await params;
  const call = await prisma.collaborationGroupCall.findUnique({ where: { id } });
  if (!call) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Appel introuvable." }, { status: 404 });
  }
  const member = await assertGroupMemberForSession(call.groupId, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCallParticipant.updateMany({
      where: { callId: call.id, userId: session.userId },
      data: { status: "LEFT", leftAt: new Date() },
    });
    await tx.collaborationGroupCallEvent.create({
      data: {
        callId: call.id,
        groupId: call.groupId,
        meetingId: call.meetingId,
        userId: session.userId,
        eventType: "CALL_LEFT",
        message: `${session.name} a quitté l'appel.`,
      },
    });
  });
  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: `${session.name} a quitté l'appel.` });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.leave", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
