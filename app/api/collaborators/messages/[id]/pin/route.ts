import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, writeGroupAudit } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationMessagePinSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

async function handlePin(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-pin:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = collaborationMessagePinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findUnique({ where: { id }, select: { id: true, groupId: true, deletedAt: true } });
  if (!message || message.deletedAt) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const member = await assertGroupMemberForSession(message.groupId, session);
  if (!member || !canManageGroup(member, session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const pinned = parsed.data.action === "PIN";
  await prisma.collaborationGroupMessage.update({ where: { id }, data: { pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? session.userId : null } });
  await writeGroupAudit({ groupId: message.groupId, actorId: session.userId, action: pinned ? "message.pin" : "message.unpin", entityType: "CollaborationGroupMessage", entityId: id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, pinned });
}

export const POST = handlePin;
export const PATCH = handlePin;
