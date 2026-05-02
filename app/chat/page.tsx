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
    include: { _count: { select: { messages: true } } },
  });

  return (
    <AppShell user={user}>
      <ChatWorkspace
        initialConversations={JSON.parse(JSON.stringify(conversations))}
        initialConversationId={conversationId}
      />
    </AppShell>
  );
}
