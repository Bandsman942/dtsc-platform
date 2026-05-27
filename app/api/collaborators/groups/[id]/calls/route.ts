import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, createGroupSystemMessage, groupMemberUserIds, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { buildLiveKitRoomName } from "@/lib/livekit-service";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { collaborationCallStartSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const calls = await prisma.collaborationGroupCall.findMany({
    where: { groupId: id },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { participants: true, events: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    activeCall: calls.find((call) => call.status === "RINGING" || call.status === "ACTIVE") || null,
    calls,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await touchUserPresence(session.userId);
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = collaborationCallStartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid call" }, { status: 400 });
  }

  const existingCall = await prisma.collaborationGroupCall.findFirst({
    where: { groupId: id, status: { in: ["RINGING", "ACTIVE"] } },
    orderBy: { startedAt: "desc" },
  });
  if (existingCall) {
    await writeApiLog({ request: req, statusCode: 409, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Un appel est déjà en cours dans ce groupe.", activeCall: existingCall }, { status: 409 });
  }

  const meetingId = parsed.data.meetingId || member.group.meetingId || null;
  if (meetingId) {
    const meeting = await prisma.cooMeeting.findFirst({
      where: { id: meetingId, OR: [{ collaborationGroupId: id }, { collaborationGroupId: null }] },
      select: { id: true, title: true },
    });
    if (!meeting) {
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const memberUserIds = await groupMemberUserIds(id);
  const roomName = buildLiveKitRoomName({ groupId: id, meetingId, callType: parsed.data.callType });
  const content = `${session.name} a lancé un appel ${parsed.data.callType === "VIDEO" ? "vidéo" : "audio"}.`;
  const call = await prisma.$transaction(async (tx) => {
    const createdCall = await tx.collaborationGroupCall.create({
      data: {
        groupId: id,
        meetingId,
        callType: parsed.data.callType,
        provider: "LIVEKIT",
        roomName,
        status: "RINGING",
        startedById: session.userId,
        participants: {
          create: memberUserIds.map((userId) => ({
            userId,
            status: userId === session.userId ? "JOINED" : "INVITED",
            joinedAt: userId === session.userId ? new Date() : null,
            cameraEnabled: parsed.data.callType === "VIDEO" && userId === session.userId,
          })),
        },
        events: {
          create: {
            groupId: id,
            meetingId,
            userId: session.userId,
            eventType: "CALL_STARTED",
            message: content,
          },
        },
      },
      include: { participants: true, events: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
    if (meetingId) {
      await tx.cooMeeting.update({ where: { id: meetingId }, data: { activeCallId: createdCall.id, status: "HELD" } });
    }
    return createdCall;
  });

  await createGroupSystemMessage({ groupId: id, actorId: session.userId, content });
  await notifyUsers({
    userIds: memberUserIds.filter((userId) => userId !== session.userId),
    title: parsed.data.callType === "VIDEO" ? "Appel vidéo DTSC démarré" : "Appel audio DTSC démarré",
    body: `${session.name} a lancé un appel dans ${member.group.name}.`,
    type: "COLLABORATION",
    targetUrl: "/collaborators",
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "call.start", entityType: "CollaborationGroupCall", entityId: call.id });
  await writeAuditLog({ userId: session.userId, action: "collaboration.call.start", entity: "CollaborationGroupCall", entityId: call.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, call }, { status: 201 });
}
