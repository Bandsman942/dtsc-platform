import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, createGroupSystemMessage, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await touchUserPresence(session.userId);
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-call-reject:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { id } = await params;
  const call = await prisma.collaborationGroupCall.findUnique({ where: { id }, include: { group: { select: { groupType: true } } } });
  if (!call || !["RINGING", "ACTIVE"].includes(call.status)) return NextResponse.json({ error: "CALL_EXPIRED", message: "Cet appel n’est plus disponible." }, { status: 409 });
  if (!(await assertGroupMemberForSession(call.groupId, session))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (call.startedById === session.userId) return NextResponse.json({ error: "INVALID_STATE", message: "L’appelant doit annuler ou terminer l’appel." }, { status: 409 });

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.collaborationGroupCallParticipant.updateMany({
      where: { callId: call.id, userId: session.userId, status: { in: ["INVITED", "JOINED"] } },
      data: { status: "REJECTED", leftAt: now },
    });
    await tx.collaborationGroupCallEvent.create({
      data: { callId: call.id, groupId: call.groupId, meetingId: call.meetingId, userId: session.userId, eventType: "CALL_REJECTED", message: `${session.name} a refusé l’appel.` },
    });
    const remaining = await tx.collaborationGroupCallParticipant.count({ where: { callId: call.id, userId: { not: call.startedById }, status: { in: ["INVITED", "JOINED"] } } });
    const closeCall = call.group.groupType === "DIRECT" || remaining === 0;
    if (closeCall) {
      await tx.collaborationGroupCall.update({ where: { id: call.id }, data: { status: "REJECTED", endedAt: now, durationSeconds: 0 } });
      if (call.meetingId) await tx.cooMeeting.updateMany({ where: { id: call.meetingId, activeCallId: call.id }, data: { activeCallId: null } });
    }
    return { closeCall };
  });
  await createGroupSystemMessage({ groupId: call.groupId, actorId: session.userId, content: `${session.name} a refusé l’appel.` });
  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: "call.reject", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.call.reject", entity: "CollaborationGroupCall", entityId: call.id, request: req, metadata: { groupId: call.groupId, callEnded: result.closeCall } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, callEnded: result.closeCall });
}
