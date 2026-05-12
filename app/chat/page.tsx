import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const user = await requireUser();
  const { conversationId } = await searchParams;
  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
    take: 200,
  });
  const projects = await prisma.conversationProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { conversations: true } } },
    take: 100,
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resetAt = new Date(today);
  resetAt.setDate(resetAt.getDate() + 1);
  const [messagesToday, tokensToday] = await Promise.all([
    prisma.message.count({ where: { userId: user.id, role: "user", createdAt: { gte: today } } }),
    prisma.usageLog.aggregate({
      where: { userId: user.id, createdAt: { gte: today } },
      _sum: { totalTokens: true },
    }),
  ]);

  return (
    <AppShell user={user}>
      <ChatWorkspace
        initialConversations={JSON.parse(JSON.stringify(conversations))}
        initialProjects={JSON.parse(JSON.stringify(projects))}
        initialConversationId={conversationId}
        usage={{
          messagesToday,
          dailyMessageLimit: user.dailyMessageLimit,
          tokensToday: tokensToday._sum.totalTokens ?? 0,
          dailyTokenLimit: user.dailyTokenLimit,
          resetAt: resetAt.toISOString(),
        }}
      />
    </AppShell>
  );
}
