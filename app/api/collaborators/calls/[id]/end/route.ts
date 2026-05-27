import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
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

  const endedAt = new Date();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000));
  await prisma.$transaction(async (tx) => {
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
    if (call.meetingId) {
      await tx.cooMeeting.updateMany({ where: { id: call.meetingId, activeCallId: call.id }, data: { activeCallId: null } });
    }
  });
  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: "L'appel est terminé." });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.end", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.call.end", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
