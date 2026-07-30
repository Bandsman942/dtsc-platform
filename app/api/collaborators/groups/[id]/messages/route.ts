import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, canManageGroup, groupMemberUserIds, markGroupMessagesRead, parseMentionedUserIds, touchUserPresence, writeGroupAudit } from "@/lib/collaboration";
import { meetingLinkCanJoin, syncCooMeetingLink } from "@/lib/collaboration-meeting-links";
import { notifyUsers } from "@/lib/notifications";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationMessageSchema } from "@/lib/validators";

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

  if (member.group.meetingId) {
    const meeting = await prisma.cooMeeting.findFirst({
      where: { id: member.group.meetingId, collaborationGroupId: id },
      select: { id: true, title: true, meetingMode: true, meetingDate: true, meetingTime: true, collaborationGroupId: true, status: true },
    });
    if (meeting) {
      await syncCooMeetingLink({ meeting, actorId: member.group.ownerId }).catch(() => null);
    }
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 30), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  const records = await prisma.collaborationGroupMessage.findMany({
    where: { groupId: id, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } },
      replyTo: { select: { id: true, content: true, author: { select: { id: true, name: true } }, createdAt: true, deletedAt: true } },
      mentions: { include: { mentionedUser: { select: { id: true, name: true, email: true, jobTitle: true } } } },
      reads: { select: { userId: true, readAt: true } },
      sharedChatbotConversation: { select: { id: true, title: true, updatedAt: true } },
      sharedConversationSnapshot: { select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } },
    },
  });
  const hasMore = records.length > limit;
  const baseMessages = records.slice(0, limit).reverse();
  const messageIds = baseMessages.map((message) => message.id);
  const [meetingLinks, minutePublications] = messageIds.length
    ? await Promise.all([
        prisma.collaborationMeetingLink.findMany({ where: { messageId: { in: messageIds } } }),
        prisma.collaborationMeetingMinutesPublication.findMany({
          where: { OR: [{ promptMessageId: { in: messageIds } }, { summaryMessageId: { in: messageIds } }] },
        }),
      ])
    : [[], []];

  const meetingLinkByMessage = new Map(meetingLinks.map((link) => [link.messageId, link]));
  const publicationByMessage = new Map<string, (typeof minutePublications)[number]>();
  for (const publication of minutePublications) {
    publicationByMessage.set(publication.promptMessageId, publication);
    if (publication.summaryMessageId) publicationByMessage.set(publication.summaryMessageId, publication);
  }

  const meetingIds = [...new Set(minutePublications.map((item) => item.meetingId))];
  const meetings = meetingIds.length
    ? await prisma.cooMeeting.findMany({ where: { id: { in: meetingIds } }, select: { id: true, title: true, reportOwnerEmployeeId: true } })
    : [];
  const reportOwnerEmployeeIds = meetings.map((meeting) => meeting.reportOwnerEmployeeId).filter((value): value is string => Boolean(value));
  const reportOwners = reportOwnerEmployeeIds.length
    ? await prisma.hrcfoEmployee.findMany({ where: { id: { in: reportOwnerEmployeeIds }, status: { not: "EXITED" } }, select: { id: true, userId: true } })
    : [];
  const reportOwnerUserByEmployee = new Map(reportOwners.map((employee) => [employee.id, employee.userId]));
  const meetingById = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  const manager = canManageGroup(member, session.role);
  const now = new Date();

  const messages = baseMessages.map((message) => {
    const link = meetingLinkByMessage.get(message.id);
    const publication = publicationByMessage.get(message.id);
    const linkedMeeting = publication ? meetingById.get(publication.meetingId) : null;
    const reportOwnerUserId = linkedMeeting?.reportOwnerEmployeeId ? reportOwnerUserByEmployee.get(linkedMeeting.reportOwnerEmployeeId) : null;
    return {
      ...message,
      meetingLink: link
        ? {
            id: link.id,
            meetingId: link.meetingId,
            groupId: link.groupId,
            callType: link.callType,
            scheduledAt: link.scheduledAt,
            availableFrom: link.availableFrom,
            status: link.status,
            lastCallId: link.lastCallId,
            canJoin: meetingLinkCanJoin(link, now),
          }
        : null,
      meetingFollowUp: publication
        ? {
            id: publication.id,
            meetingId: publication.meetingId,
            callId: publication.callId,
            status: publication.status,
            minutesId: publication.minutesId,
            summary: publication.summary,
            meetingTitle: linkedMeeting?.title || null,
            canCreateMinutes: manager || reportOwnerUserId === session.userId,
          }
        : null,
    };
  });

  const nextCursor = hasMore ? records[limit - 1]?.createdAt.toISOString() : null;
  await markGroupMessagesRead({ groupId: id, userId: session.userId, messageIds: messages.map((message) => message.id) });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ messages, nextCursor, hasMore });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-message:${session.userId}`), 300, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  await touchUserPresence(session.userId);
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member || member.group.status !== "ACTIVE") {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = collaborationMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  if (parsed.data.replyToId) {
    const reply = await prisma.collaborationGroupMessage.findFirst({ where: { id: parsed.data.replyToId, groupId: id }, select: { id: true } });
    if (!reply) {
      await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { reason: "cross_group_reply" } });
      return NextResponse.json({ error: "Invalid reply target" }, { status: 400 });
    }
  }

  const organizationId = getActiveOrganizationId(session);
  const sharedConversation = parsed.data.sharedChatbotConversationId
    ? await prisma.conversation.findFirst({
        where: { id: parsed.data.sharedChatbotConversationId, userId: session.userId, organizationId },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          messages: { orderBy: { createdAt: "asc" }, take: 300, select: { id: true, role: true, content: true, createdAt: true } },
        },
      })
    : null;
  if (parsed.data.sharedChatbotConversationId && !sharedConversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const memberUserIds = await groupMemberUserIds(id);
  const mentionedUserIds = await parseMentionedUserIds(parsed.data.mentionedUserIds, memberUserIds);
  const message = await prisma.$transaction(async (tx) => {
    const savedMessage = await tx.collaborationGroupMessage.create({
      data: {
        groupId: id,
        authorId: session.userId,
        content: parsed.data.content,
        messageType: parsed.data.messageType,
        replyToId: parsed.data.replyToId || null,
        sharedChatbotConversationId: parsed.data.sharedChatbotConversationId || null,
        mentions: { create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId, isRead: mentionedUserId === session.userId })) },
      },
    });
    if (sharedConversation) {
      await tx.collaborationSharedConversation.create({
        data: {
          originalConversationId: sharedConversation.id,
          sharedById: session.userId,
          groupId: id,
          messageId: savedMessage.id,
          title: sharedConversation.title,
          snapshotJson: {
            conversationId: sharedConversation.id,
            title: sharedConversation.title,
            updatedAt: sharedConversation.updatedAt.toISOString(),
            messages: sharedConversation.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, createdAt: item.createdAt.toISOString() })),
          },
        },
      });
    }
    return tx.collaborationGroupMessage.findUniqueOrThrow({
      where: { id: savedMessage.id },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } },
        replyTo: { select: { id: true, content: true, author: { select: { id: true, name: true } }, createdAt: true, deletedAt: true } },
        mentions: { include: { mentionedUser: { select: { id: true, name: true, email: true, jobTitle: true } } } },
        reads: { select: { userId: true, readAt: true } },
        sharedChatbotConversation: { select: { id: true, title: true, updatedAt: true } },
        sharedConversationSnapshot: { select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } },
      },
    });
  });
  await markGroupMessagesRead({ groupId: id, userId: session.userId, messageIds: [message.id] });

  const candidates = mentionedUserIds.length
    ? mentionedUserIds.filter((userId) => userId !== session.userId)
    : memberUserIds.filter((userId) => userId !== session.userId);
  const preferences = candidates.length ? await prisma.collaborationGroupPreference.findMany({ where: { groupId: id, userId: { in: candidates } } }) : [];
  const preferenceByUser = new Map(preferences.map((item) => [item.userId, item]));
  const now = Date.now();
  const recipients = [...new Set(candidates)].filter((userId) => {
    const preference = preferenceByUser.get(userId);
    if (!preference) return true;
    if (preference.notifications === "NONE") return false;
    if (!mentionedUserIds.length && preference.notifications === "MENTIONS") return false;
    if (preference.mutedUntil && preference.mutedUntil.getTime() > now) return false;
    return true;
  });
  await notifyUsers({
    userIds: recipients,
    title: mentionedUserIds.length ? "Mention dans un groupe DTSC" : "Nouveau message de groupe",
    body: `${session.name}: ${parsed.data.content.slice(0, 160)}`,
    type: "COLLABORATION",
    targetUrl: `/collaborators?groupId=${encodeURIComponent(id)}`,
    organizationId: member.group.organizationId,
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "message.create", entityType: "CollaborationGroupMessage", entityId: message.id });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, message }, { status: 201 });
}
