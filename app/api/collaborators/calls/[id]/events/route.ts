import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationCallEventSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

const EVENT_MESSAGES: Record<"CALL_INTERRUPTED" | "CALL_RECONNECTED", string> = {
  CALL_INTERRUPTED: "Connexion instable dans l'appel.",
  CALL_RECONNECTED: "L'appel a repris.",
};

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaboration_call_event_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);

  const limited = await rateLimit(getRateLimitKey(req, `collaboration-call-event:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop d'événements d'appel sur une courte période." }, { status: 429 });
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

  const parsed = collaborationCallEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Événement d'appel invalide." }, { status: 400 });
  }

  await prisma.collaborationGroupCallEvent.create({
    data: {
      callId: call.id,
      groupId: call.groupId,
      meetingId: call.meetingId,
      userId: session.userId,
      eventType: parsed.data.eventType,
      message: EVENT_MESSAGES[parsed.data.eventType],
    },
  });

  await writeGroupAudit({ groupId: call.groupId, actorId: session.userId, action: `call.event.${parsed.data.eventType.toLowerCase()}`, entityType: "CollaborationGroupCall", entityId: call.id });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true }, { status: 201 });
}
