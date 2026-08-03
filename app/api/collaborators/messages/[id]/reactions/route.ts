import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, writeGroupAudit } from "@/lib/collaboration";
import { collaboratorsNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationMessageReactionSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-reaction:${session.userId}`), 600, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = collaborationMessageReactionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, groupId: true, authorId: true, group: { select: { organizationId: true } } },
  });
  if (!message || !(await assertGroupMemberForSession(message.groupId, session))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (parsed.data.action === "REMOVE") {
    await prisma.collaborationMessageReaction.deleteMany({ where: { messageId: id, userId: session.userId, reactionType: parsed.data.reactionType } });
  } else {
    await prisma.collaborationMessageReaction.upsert({
      where: { messageId_userId_reactionType: { messageId: id, userId: session.userId, reactionType: parsed.data.reactionType } },
      create: { groupId: message.groupId, messageId: id, userId: session.userId, reactionType: parsed.data.reactionType },
      update: {},
    });
    if (message.authorId !== session.userId) {
      await notifyUser({
        userId: message.authorId,
        title: "Réaction à votre message",
        body: `${session.name} a réagi à votre message.`,
        type: "COLLABORATION",
        targetUrl: collaboratorsNotificationTarget(message.groupId, message.id),
        organizationId: message.group.organizationId,
        idempotencyKey: `collaboration:reaction:${message.id}:${session.userId}:${parsed.data.reactionType}`,
      });
    }
  }
  const reactions = await prisma.collaborationMessageReaction.findMany({ where: { messageId: id }, select: { id: true, userId: true, reactionType: true, createdAt: true } });
  await writeGroupAudit({ groupId: message.groupId, actorId: session.userId, action: `message.reaction.${parsed.data.action.toLowerCase()}`, entityType: "CollaborationGroupMessage", entityId: id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, reactions });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const raw = await req.json().catch(() => ({})) as { reactionType?: string };
  const reactionType = raw.reactionType || "LIKE";
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findUnique({ where: { id }, select: { id: true, groupId: true } });
  if (!message || !(await assertGroupMemberForSession(message.groupId, session))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await prisma.collaborationMessageReaction.deleteMany({ where: { messageId: id, userId: session.userId, reactionType } });
  await writeGroupAudit({ groupId: message.groupId, actorId: session.userId, action: "message.reaction.remove", entityType: "CollaborationGroupMessage", entityId: id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
