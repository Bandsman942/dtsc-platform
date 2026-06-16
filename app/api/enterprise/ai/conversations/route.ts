import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiConversationListSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = enterpriseAiConversationListSchema.safeParse({ organizationId: url.searchParams.get("organizationId") || "" });
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const access = await getEnterpriseAiAccess(session, parsed.data.organizationId, "read");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const conversations = await prisma.enterpriseAiConversation.findMany({
    where: { organizationId: parsed.data.organizationId, userId: session.userId, status: "ACTIVE", deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 80,
        select: { id: true, role: true, content: true, createdAt: true, updatedAt: true, editedAt: true, citationsJson: true, toolResultsJson: true },
      },
      _count: { select: { messages: { where: { deletedAt: null } } } },
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId } });
  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      projectName: conversation.projectName,
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
      _count: conversation._count,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
        editedAt: message.editedAt?.toISOString() || null,
        citations: message.citationsJson,
        toolResults: message.toolResultsJson,
      })),
    })),
    permissions: {
      canChat: access.canChat,
      canUseReadTools: access.canUseReadTools,
      canUseActionDrafts: access.canUseActionDrafts,
    },
  });
}
