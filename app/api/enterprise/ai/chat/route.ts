import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { buildAssistantResponsePreferencePrompt, getEnterpriseAiConversationPreference } from "@/lib/assistant-conversation-preferences";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { buildEnterpriseAiInstructions, buildEnterpriseAiPrompt } from "@/lib/enterprise-ai/context";
import { retrieveEnterpriseAiKnowledge } from "@/lib/enterprise-ai/knowledge";
import { runPharmacyReadTools } from "@/lib/enterprise-ai/pharmacy-tools";
import { assertEnterpriseAiMessageQuota, getEnterpriseAiUsageSnapshot, recordEnterpriseAiUsage } from "@/lib/enterprise-ai/usage";
import { enterpriseAiChatSchema } from "@/lib/enterprise-ai/validators";
import { createOpenAIResponseStream } from "@/lib/openai";
import { isConfiguredOpenAIModel } from "@/lib/openai-config";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const jsonValue = (value: unknown) => value as Prisma.InputJsonValue;
export const maxDuration = 60;

function parseOpenAIEvent(block: string) {
  const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.replace(/^data:\s*/, "")).join("");
  if (!data || data === "[DONE]") return null;
  return JSON.parse(data) as {
    type?: string;
    delta?: string;
    response?: { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } };
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_chat_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-chat:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop de messages IA envoyés en peu de temps." }, { status: 429 });
  const parsed = enterpriseAiChatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Le message IA Entreprise est invalide." }, { status: 400 });
  const data = parsed.data;
  if (data.model && !isConfiguredOpenAIModel(data.model)) return NextResponse.json({ error: "Model not configured", message: "Le modèle IA sélectionné n'est pas autorisé." }, { status: 400 });

  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) return NextResponse.json({ error: "Forbidden", message: "Accès non autorisé à l'IA Assistant Entreprise." }, { status: 403 });
  const quota = await assertEnterpriseAiMessageQuota(data.organizationId, session.userId, access);
  if (!quota.ok) return NextResponse.json({ error: "MONTHLY_LIMIT_REACHED", message: "Le quota mensuel de messages IA de cette entreprise est atteint.", usage: quota.snapshot }, { status: 429 });

  try {
    const existingConversationId = data.conversationId || null;
    const conversation = existingConversationId
      ? await prisma.enterpriseAiConversation.findFirst({
          where: { id: existingConversationId, organizationId: data.organizationId, userId: session.userId, status: "ACTIVE", deletedAt: null },
          select: { id: true, title: true },
        })
      : await prisma.enterpriseAiConversation.create({
          data: { organizationId: data.organizationId, assistantId: access.assistantId, userId: session.userId, title: data.content.slice(0, 90), lastMessageAt: new Date() },
          select: { id: true, title: true },
        });
    if (!conversation) return NextResponse.json({ error: "Conversation not found", message: "Conversation IA introuvable." }, { status: 404 });

    if (!existingConversationId) {
      await prisma.enterpriseAiConversationPreference.upsert({
        where: { conversationId: conversation.id },
        update: {},
        create: { conversationId: conversation.id, organizationId: data.organizationId, userId: session.userId, modelOverride: data.model || null, useKnowledge: data.useKnowledge, useTools: data.useTools },
      });
    }
    const preference = await getEnterpriseAiConversationPreference({ conversationId: conversation.id, organizationId: data.organizationId, userId: session.userId });
    const effectiveModel = preference?.modelOverride || data.model || undefined;
    if (effectiveModel && !isConfiguredOpenAIModel(effectiveModel)) return NextResponse.json({ error: "Model not configured" }, { status: 400 });
    const useKnowledge = preference?.useKnowledge ?? data.useKnowledge;
    const useTools = preference?.useTools ?? data.useTools;

    await prisma.enterpriseAiMessage.create({
      data: { organizationId: data.organizationId, conversationId: conversation.id, userId: session.userId, role: "user", content: data.content, tokenHint: Math.ceil(data.content.length / 4) },
    });

    const [knowledge, toolResults] = await Promise.all([
      useKnowledge
        ? retrieveEnterpriseAiKnowledge({ organizationId: data.organizationId, question: data.content, sectorCode: access.sectorCode, moduleCode: null, canReadSensitive: access.canManageSources })
        : Promise.resolve({ context: "", citations: [] }),
      useTools && access.canUseReadTools && access.sectorCode === "PHARMACY" ? runPharmacyReadTools(data.organizationId, data.content) : Promise.resolve([]),
    ]);

    if (toolResults.length) {
      await prisma.enterpriseAiToolCall.createMany({
        data: toolResults.map((result) => ({ organizationId: data.organizationId, assistantId: access.assistantId, conversationId: conversation.id, userId: session.userId, toolName: result.toolName, toolType: "READ", status: "SUCCESS", inputJson: jsonValue({ question: data.content }), outputJson: jsonValue(result) })),
      });
    }

    const previousMessages = await prisma.enterpriseAiMessage.findMany({
      where: { organizationId: data.organizationId, conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });
    const baseInstructions = await buildEnterpriseAiInstructions(access);
    const preferenceInstructions = buildAssistantResponsePreferencePrompt({
      style: preference?.responseStyle,
      length: preference?.responseLength,
      customInstructions: preference?.customInstructions,
    });
    const instructions = `${baseInstructions}\n\nPréférences de cette conversation:\n${preferenceInstructions}`;
    const prompt = buildEnterpriseAiPrompt({ question: data.content, knowledgeContext: knowledge.context, citations: knowledge.citations, toolResults });
    const openAIStream = await createOpenAIResponseStream({
      model: effectiveModel,
      instructions,
      messages: [
        ...previousMessages.reverse().map((historyMessage) => ({ role: historyMessage.role === "assistant" ? "assistant" as const : "user" as const, content: historyMessage.content })),
        { role: "user", content: prompt },
      ],
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = openAIStream.getReader();
        let buffer = "";
        let assistantContent = "";
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const event = parseOpenAIEvent(block);
              if (!event) continue;
              if (event.type === "response.output_text.delta" && event.delta) {
                assistantContent += event.delta;
                controller.enqueue(encoder.encode(event.delta));
              }
              if (event.type === "response.completed" && event.response?.usage) {
                usage = { inputTokens: event.response.usage.input_tokens ?? 0, outputTokens: event.response.usage.output_tokens ?? 0, totalTokens: event.response.usage.total_tokens ?? 0 };
              }
            }
          }

          if (assistantContent.trim()) {
            await prisma.enterpriseAiMessage.create({
              data: {
                organizationId: data.organizationId,
                conversationId: conversation.id,
                role: "assistant",
                content: assistantContent,
                model: effectiveModel || null,
                citationsJson: jsonValue(knowledge.citations.map((citation) => ({ sourceId: citation.sourceId, title: citation.title, confidentiality: citation.confidentiality, distance: citation.distance }))),
                toolResultsJson: jsonValue(toolResults),
                tokenHint: Math.ceil(assistantContent.length / 4),
              },
            });
            await Promise.all([
              prisma.enterpriseAiConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), title: conversation.title === "Nouvelle conversation" ? data.content.slice(0, 90) : undefined } }),
              recordEnterpriseAiUsage({ organizationId: data.organizationId, assistantId: access.assistantId, conversationId: conversation.id, userId: session.userId, inputTokens: usage.inputTokens || Math.ceil(prompt.length / 4), outputTokens: usage.outputTokens || Math.ceil(assistantContent.length / 4) }),
              writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_CHAT_COMPLETED", entity: "EnterpriseAiConversation", entityId: conversation.id, request: req, metadata: { organizationId: data.organizationId, toolCount: toolResults.length, citationCount: knowledge.citations.length, useKnowledge, useTools } }),
            ]);
            await getEnterpriseAiUsageSnapshot(data.organizationId, session.userId, access);
            await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, conversationId: conversation.id, totalTokens: usage.totalTokens } });
          }
        } catch (streamError) {
          console.error("Enterprise AI streaming failed", streamError);
          controller.enqueue(encoder.encode("\n\nUne erreur est survenue pendant la génération. Veuillez réessayer."));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Conversation-Id": conversation.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enterprise AI chat failed";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, message } });
    return NextResponse.json({ error: "Enterprise AI failed", message: "L'assistant IA Entreprise est momentanément indisponible." }, { status: 500 });
  }
}
