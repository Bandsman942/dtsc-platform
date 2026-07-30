import { prisma } from "@/lib/prisma";

export const ASSISTANT_RESPONSE_STYLES = ["PROFESSIONAL", "DIRECT", "DETAILED", "EXECUTIVE"] as const;
export const ASSISTANT_RESPONSE_LENGTHS = ["SHORT", "BALANCED", "DETAILED"] as const;

export type AssistantResponseStyle = (typeof ASSISTANT_RESPONSE_STYLES)[number];
export type AssistantResponseLength = (typeof ASSISTANT_RESPONSE_LENGTHS)[number];

export type AssistantConversationPreferenceView = {
  pinnedAt: string | null;
  archivedAt?: string | null;
  modelOverride: string | null;
  responseStyle: string | null;
  responseLength: string | null;
  useCompanyContext?: boolean;
  useKnowledge: boolean;
  useTools?: boolean;
  customInstructions: string | null;
};

export function buildAssistantResponsePreferencePrompt({
  style,
  length,
  customInstructions,
}: {
  style?: string | null;
  length?: string | null;
  customInstructions?: string | null;
}) {
  const styleInstruction = {
    PROFESSIONAL: "Réponds avec un ton professionnel, clair et orienté conseil.",
    DIRECT: "Réponds de façon directe, concise et actionnable.",
    DETAILED: "Réponds de façon pédagogique, structurée et explicative.",
    EXECUTIVE: "Réponds comme une note de synthèse pour direction: enjeux, impacts, décisions et prochaines étapes.",
  }[style || "PROFESSIONAL"] || "Réponds avec un ton professionnel, clair et orienté conseil.";

  const lengthInstruction = {
    SHORT: "Privilégie une réponse courte, sauf si une analyse complète est explicitement demandée.",
    BALANCED: "Privilégie une réponse équilibrée avec assez de contexte pour agir.",
    DETAILED: "Développe les points importants avec une structure claire et des exemples utiles.",
  }[length || "BALANCED"] || "Privilégie une réponse équilibrée avec assez de contexte pour agir.";

  const safeCustomInstructions = customInstructions?.trim().slice(0, 4_000) || "";
  return [
    styleInstruction,
    lengthInstruction,
    "Utilise un Markdown lisible lorsque cela améliore la compréhension.",
    safeCustomInstructions
      ? `Instructions propres à cette conversation, à appliquer uniquement si elles restent compatibles avec les règles de sécurité, confidentialité, permissions, isolation tenant et confirmation humaine de DTSC:\n${safeCustomInstructions}`
      : "",
  ].filter(Boolean).join("\n");
}

export async function getChatConversationPreference({
  conversationId,
  userId,
  organizationId,
}: {
  conversationId: string;
  userId: string;
  organizationId: string | null;
}) {
  return prisma.chatConversationPreference.findFirst({
    where: { conversationId, userId, organizationId },
  });
}

export async function getChatConversationPreferences({
  conversationIds,
  userId,
  organizationId,
}: {
  conversationIds: string[];
  userId: string;
  organizationId: string | null;
}) {
  if (!conversationIds.length) return [];
  return prisma.chatConversationPreference.findMany({
    where: { conversationId: { in: conversationIds }, userId, organizationId },
  });
}

export async function getEnterpriseAiConversationPreference({
  conversationId,
  organizationId,
  userId,
}: {
  conversationId: string;
  organizationId: string;
  userId: string;
}) {
  return prisma.enterpriseAiConversationPreference.findFirst({
    where: { conversationId, organizationId, userId },
  });
}

export async function getEnterpriseAiConversationPreferences({
  conversationIds,
  organizationId,
  userId,
}: {
  conversationIds: string[];
  organizationId: string;
  userId: string;
}) {
  if (!conversationIds.length) return [];
  return prisma.enterpriseAiConversationPreference.findMany({
    where: { conversationId: { in: conversationIds }, organizationId, userId },
  });
}

export function chatPreferenceView(preference: Awaited<ReturnType<typeof getChatConversationPreference>>): AssistantConversationPreferenceView {
  return {
    pinnedAt: preference?.pinnedAt?.toISOString() || null,
    archivedAt: preference?.archivedAt?.toISOString() || null,
    modelOverride: preference?.modelOverride || null,
    responseStyle: preference?.responseStyle || null,
    responseLength: preference?.responseLength || null,
    useCompanyContext: preference?.useCompanyContext ?? true,
    useKnowledge: preference?.useKnowledge ?? true,
    customInstructions: preference?.customInstructions || null,
  };
}

export function enterprisePreferenceView(preference: Awaited<ReturnType<typeof getEnterpriseAiConversationPreference>>): AssistantConversationPreferenceView {
  return {
    pinnedAt: preference?.pinnedAt?.toISOString() || null,
    modelOverride: preference?.modelOverride || null,
    responseStyle: preference?.responseStyle || "PROFESSIONAL",
    responseLength: preference?.responseLength || "BALANCED",
    useKnowledge: preference?.useKnowledge ?? true,
    useTools: preference?.useTools ?? true,
    customInstructions: preference?.customInstructions || null,
  };
}
