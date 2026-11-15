import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, markGroupMessagesRead } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };
const BATCH_SIZE = 400;
const MAX_BATCHES = 50;

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-read:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const cutoff = new Date();
  let count = 0;
  let complete = false;
  // A conversation exit acknowledges its entire existing history, not only
  // the latest 30 messages. Keep the canonical message-read receipt records.
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const unread = await prisma.collaborationGroupMessage.findMany({
      where: {
        groupId: id,
        authorId: { not: session.userId },
        deletedAt: null,
        messageType: { not: "SYSTEM" },
        createdAt: { lte: cutoff },
        reads: { none: { userId: session.userId } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (!unread.length) { complete = true; break; }
    const read = await markGroupMessagesRead({ groupId: id, userId: session.userId, messageIds: unread.map((message) => message.id) });
    if (!read) return NextResponse.json({ error: "READ_RECEIPT_FAILED" }, { status: 503 });
    count += unread.length;
    if (unread.length < BATCH_SIZE) { complete = true; break; }
  }
  if (complete) {
    await prisma.collaborationMessageMention.updateMany({
      where: { mentionedUserId: session.userId, isRead: false, message: { groupId: id, createdAt: { lte: cutoff } } },
      data: { isRead: true, readAt: cutoff },
    });
  }
  await writeApiLog({ request: req, userId: session.userId, startedAt, statusCode: complete ? 200 : 206, metadata: { action: "conversation_closed_read", count, complete } });
  return NextResponse.json({ ok: complete, count, complete }, { status: complete ? 200 : 206 });
}
