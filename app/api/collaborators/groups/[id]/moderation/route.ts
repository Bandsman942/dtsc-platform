import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationModerationSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-moderation:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || !canManageGroup(member, session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = collaborationModerationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  if (parsed.data.targetType !== "MESSAGE") return NextResponse.json({ error: "TARGET_NOT_SUPPORTED", message: "Cette file de modération traite actuellement les messages du groupe." }, { status: 409 });
  const message = await prisma.collaborationGroupMessage.findFirst({ where: { id: parsed.data.targetId, groupId: id }, select: { id: true, deletedAt: true } });
  if (!message) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (["HIDE", "DELETE_LOGICAL"].includes(parsed.data.action)) {
      await tx.collaborationGroupMessage.update({ where: { id: message.id }, data: { content: "Message masqué par la modération", status: "DELETED", deletedAt: new Date(), deletionScope: "MODERATION", deletionReason: parsed.data.reason } });
    } else if (parsed.data.action === "RESTORE") {
      await tx.collaborationGroupMessage.update({ where: { id: message.id }, data: { status: "SENT", deletedAt: null, deletionScope: null, deletionReason: null } });
    }
    await tx.collaborationModerationAction.create({ data: { groupId: id, actorId: session.userId, targetType: parsed.data.targetType, targetId: parsed.data.targetId, action: parsed.data.action, reason: parsed.data.reason } });
    if (parsed.data.action === "CLOSE_REPORT") {
      await tx.collaborationMessageReport.updateMany({ where: { messageId: message.id, status: "OPEN" }, data: { status: "CLOSED", moderatorId: session.userId, decision: parsed.data.reason, resolvedAt: new Date() } });
    }
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: `moderation.${parsed.data.action.toLowerCase()}`, entityType: parsed.data.targetType, entityId: parsed.data.targetId });
  await writeAuditLog({ userId: session.userId, action: `collaboration.moderation.${parsed.data.action.toLowerCase()}`, entity: parsed.data.targetType, entityId: parsed.data.targetId, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
