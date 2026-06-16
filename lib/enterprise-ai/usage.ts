import { prisma } from "@/lib/prisma";
import type { EnterpriseAiAccess } from "@/lib/enterprise-ai/access";

export function currentEnterpriseAiPeriod(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getEnterpriseAiUsageSnapshot(organizationId: string, userId: string, access: EnterpriseAiAccess) {
  const periodStart = currentEnterpriseAiPeriod();
  const [userUsage, organizationUsage, sourceCount, sourceStorage] = await Promise.all([
    prisma.enterpriseAiUsage.findUnique({
      where: { organizationId_userId_periodStart: { organizationId, userId, periodStart } },
      select: { messageCount: true, inputTokens: true, outputTokens: true, totalTokens: true },
    }),
    prisma.enterpriseAiUsage.aggregate({
      where: { organizationId, periodStart },
      _sum: { messageCount: true, inputTokens: true, outputTokens: true, totalTokens: true },
    }),
    prisma.enterpriseAiKnowledgeSource.count({ where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } } }),
    prisma.enterpriseAiKnowledgeSource.aggregate({
      where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } },
      _sum: { sizeBytes: true },
    }),
  ]);

  const usedMessages = organizationUsage._sum.messageCount || 0;
  const usedStorageMb = Math.ceil((sourceStorage._sum.sizeBytes || 0) / (1024 * 1024));

  return {
    periodStart: periodStart.toISOString(),
    user: {
      messageCount: userUsage?.messageCount || 0,
      inputTokens: userUsage?.inputTokens || 0,
      outputTokens: userUsage?.outputTokens || 0,
      totalTokens: userUsage?.totalTokens || 0,
    },
    organization: {
      messageCount: usedMessages,
      inputTokens: organizationUsage._sum.inputTokens || 0,
      outputTokens: organizationUsage._sum.outputTokens || 0,
      totalTokens: organizationUsage._sum.totalTokens || 0,
      knowledgeSources: sourceCount,
      storageMb: usedStorageMb,
    },
    limits: {
      monthlyMessages: access.limits.maxEnterpriseAiMonthlyMessages,
      knowledgeSources: access.limits.maxEnterpriseAiKnowledgeSources,
      storageMb: access.limits.maxEnterpriseAiStorageMb,
      readToolsEnabled: access.canUseReadTools,
      actionDraftsEnabled: access.canUseActionDrafts,
    },
    remaining: {
      monthlyMessages: Math.max(access.limits.maxEnterpriseAiMonthlyMessages - usedMessages, 0),
      knowledgeSources: Math.max(access.limits.maxEnterpriseAiKnowledgeSources - sourceCount, 0),
      storageMb: Math.max(access.limits.maxEnterpriseAiStorageMb - usedStorageMb, 0),
    },
  };
}

export async function assertEnterpriseAiMessageQuota(organizationId: string, userId: string, access: EnterpriseAiAccess) {
  const snapshot = await getEnterpriseAiUsageSnapshot(organizationId, userId, access);
  if (snapshot.remaining.monthlyMessages <= 0) {
    return { ok: false as const, snapshot };
  }
  return { ok: true as const, snapshot };
}

export async function recordEnterpriseAiUsage({
  organizationId,
  assistantId,
  conversationId,
  userId,
  inputTokens,
  outputTokens,
}: {
  organizationId: string;
  assistantId: string;
  conversationId: string;
  userId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const periodStart = currentEnterpriseAiPeriod();
  const totalTokens = inputTokens + outputTokens;
  return prisma.enterpriseAiUsage.upsert({
    where: { organizationId_userId_periodStart: { organizationId, userId, periodStart } },
    create: {
      organizationId,
      assistantId,
      conversationId,
      userId,
      periodStart,
      messageCount: 1,
      inputTokens,
      outputTokens,
      totalTokens,
    },
    update: {
      assistantId,
      conversationId,
      messageCount: { increment: 1 },
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      totalTokens: { increment: totalTokens },
    },
  });
}
