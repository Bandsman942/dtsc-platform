import { AssistantImmersiveWorkspaceShell } from "@/components/chat/assistant-immersive-workspace-shell";
import { AiToolConfirmationDock } from "@/components/chat/ai-tool-confirmation-dock";
import { ChatWorkspaceV2 } from "@/components/chat/chat-workspace-v2";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { listCatalogAiModelsForUi } from "@/lib/ai/catalog";
import { filterPlatformAllowedAiModels, getAiPlatformPolicy } from "@/lib/ai/platform-runtime-policy";
import { getActiveOrganizationId } from "@/lib/organizations";
import { getCanonicalAiUsageLimits } from "@/lib/billing/ai-usage-limits";
import { prisma } from "@/lib/prisma";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const { conversationId } = await searchParams;
  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id, organizationId: activeOrganizationId },
    orderBy: { updatedAt: "desc" },
    include: { project: { select: { id: true, name: true } }, _count: { select: { messages: true } } },
    take: 200,
  });
  const projects = await prisma.conversationProject.findMany({
    where: { userId: user.id, organizationId: activeOrganizationId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { conversations: true } } },
    take: 100,
  });
  const collaborationGroups = await prisma.collaborationGroup.findMany({
    where: { status: "ACTIVE", members: { some: { userId: user.id, status: "ACTIVE" } } },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resetAt = new Date(today);
  resetAt.setDate(resetAt.getDate() + 1);
  const [messagesToday, tokensToday, usageLimits] = await Promise.all([
    prisma.message.count({ where: { userId: user.id, organizationId: activeOrganizationId, role: "user", createdAt: { gte: today } } }),
    prisma.usageLog.aggregate({ where: { userId: user.id, organizationId: activeOrganizationId, createdAt: { gte: today } }, _sum: { totalTokens: true } }),
    getCanonicalAiUsageLimits({ userId: user.id, organizationId: activeOrganizationId }),
  ]);
  // The general chatbot always executes in PERSONAL, even while an enterprise
  // workspace is active. Use the same personal plan as the server orchestrator.
  const personalPlanCode = activeOrganizationId
    ? (await getCanonicalAiUsageLimits({ userId: user.id, organizationId: null })).planCode
    : usageLimits.planCode;
  const models = filterPlatformAllowedAiModels(listCatalogAiModelsForUi({
    context: "PERSONAL",
    locale: user.locale,
    planCode: personalPlanCode,
  }), await getAiPlatformPolicy());

  return (
    <AppShell user={user}>
      <AssistantImmersiveWorkspaceShell variant="chatbot">
        <ChatWorkspaceV2
          initialConversations={JSON.parse(JSON.stringify(conversations))}
          initialProjects={JSON.parse(JSON.stringify(projects))}
          collaborationGroups={JSON.parse(JSON.stringify(collaborationGroups))}
          initialConversationId={conversationId}
          userPreferences={{ locale: user.locale, timezone: user.timezone, dateFormat: user.dateFormat }}
          usage={{ messagesToday, dailyMessageLimit: usageLimits.dailyMessageLimit, tokensToday: tokensToday._sum.totalTokens ?? 0, dailyTokenLimit: usageLimits.dailyTokenLimit, resetAt: resetAt.toISOString() }}
          models={models}
          assistantDefaults={{ preferredModel: user.preferredModel || null, responseStyle: user.chatResponseStyle || "PROFESSIONAL", responseLength: user.chatResponseLength || "BALANCED" }}
        />
        <AiToolConfirmationDock conversationId={conversationId || null} locale={user.locale} />
      </AssistantImmersiveWorkspaceShell>
    </AppShell>
  );
}
