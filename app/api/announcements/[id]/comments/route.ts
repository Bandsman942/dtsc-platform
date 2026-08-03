import { NextResponse } from "next/server";
import { canReadAnnouncement } from "@/lib/announcement-access";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { announcementNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { authorizedCollaboratorIds } from "@/lib/standard-collaboration";
import { announcementCommentSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

const commentInclude = {
  user: { select: { id: true, name: true, role: true, avatarUrl: true } },
  reactions: true,
  mentions: true,
} as const;

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, scope: true, organizationId: true, moderationStatus: true, status: true, deletedAt: true },
  });
  if (!announcement || !canReadAnnouncement(announcement, session)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  const targetId = url.searchParams.get("commentId") || undefined;
  let records = await prisma.announcementComment.findMany({
    where: { announcementId: id, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: commentInclude,
  });
  if (targetId && !cursor && !records.some((item) => item.id === targetId)) {
    const target = await prisma.announcementComment.findFirst({ where: { id: targetId, announcementId: id }, include: commentInclude });
    if (target) records = [target, ...records.filter((item) => item.id !== target.id)];
  }
  const hasMore = records.length > limit;
  const comments = records.slice(0, limit).reverse();
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ comments, hasMore, nextCursor: hasMore ? records[limit - 1]?.createdAt.toISOString() : null });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `announcement-comment:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = announcementCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const parentId = parsed.data.parentId || null;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, authorId: true, title: true, scope: true, organizationId: true, moderationStatus: true, status: true, deletedAt: true, commentsEnabled: true },
  });
  if (!announcement || !canReadAnnouncement(announcement, session)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!announcement.commentsEnabled) return NextResponse.json({ error: "COMMENTS_DISABLED", message: "Les commentaires sont désactivés pour cette annonce." }, { status: 409 });
  const parentComment = parentId
    ? await prisma.announcementComment.findFirst({ where: { id: parentId, announcementId: id, deletedAt: null }, select: { id: true, userId: true } })
    : null;
  if (parentId && !parentComment) return NextResponse.json({ error: "PARENT_NOT_FOUND" }, { status: 404 });
  const authorizedIds = new Set([...(await authorizedCollaboratorIds(session)), announcement.authorId, parentComment?.userId, session.userId].filter(Boolean) as string[]);
  const mentionedUserIds = [...new Set(parsed.data.mentionedUserIds.filter((userId) => authorizedIds.has(userId) && userId !== session.userId))];

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.announcementComment.create({
      data: { announcementId: id, userId: session.userId, parentId, content: parsed.data.content },
    });
    if (mentionedUserIds.length) {
      await tx.announcementCommentMention.createMany({
        data: mentionedUserIds.map((mentionedUserId) => ({ announcementId: id, commentId: created.id, mentionedUserId })),
        skipDuplicates: true,
      });
    }
    await tx.announcement.update({ where: { id }, data: { lastAction: parentId ? "Réponse publiée" : "Commentaire publié" } });
    return created;
  });

  const recipientIds = new Set([announcement.authorId, parentComment?.userId, ...mentionedUserIds].filter((userId): userId is string => Boolean(userId && userId !== session.userId)));
  await Promise.all([...recipientIds].map((userId) => notifyUser({
    userId,
    title: mentionedUserIds.includes(userId) ? "Mention dans un commentaire" : parentComment?.userId === userId ? "Nouvelle réponse à votre commentaire" : "Nouveau commentaire sur votre annonce",
    body: announcement.title,
    type: "ANNOUNCEMENT",
    targetUrl: announcementNotificationTarget(id, comment.id),
    organizationId: announcement.organizationId,
    idempotencyKey: `announcement:comment:${comment.id}:${userId}`,
  })));
  await writeAuditLog({ userId: session.userId, action: parentId ? "announcement.comment.reply" : "announcement.comment.create", entity: "AnnouncementComment", entityId: comment.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
