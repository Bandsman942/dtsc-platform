import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatPreferenceView, getChatConversationPreferences } from "@/lib/assistant-conversation-preferences";
import { writeApiLog } from "@/lib/audit";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = getActiveOrganizationId(session);
  const conversations = await prisma.conversation.findMany({
    where: { userId: session.userId, organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
    take: 200,
  });
  const preferences = await getChatConversationPreferences({
    conversationIds: conversations.map((conversation) => conversation.id),
    userId: session.userId,
    organizationId,
  });
  const preferenceByConversationId = new Map(preferences.map((preference) => [preference.conversationId, preference]));

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      ...conversation,
      preference: chatPreferenceView(preferenceByConversationId.get(conversation.id) || null),
    })),
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "conversation_create_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `conversation-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const organizationId = getActiveOrganizationId(session);
  const conversation = await prisma.conversation.create({
    data: {
      userId: session.userId,
      organizationId,
      title: "Nouvelle conversation",
    },
  });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "conversation_create", conversationId: conversation.id },
  });

  return NextResponse.json({ conversation: { ...conversation, preference: chatPreferenceView(null) } });
}
