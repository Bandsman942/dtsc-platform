import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { buildEnterpriseAiInstructions, buildEnterpriseAiPrompt } from "@/lib/enterprise-ai/context";
import { retrieveEnterpriseAiKnowledge } from "@/lib/enterprise-ai/knowledge";
import { runPharmacyReadTools } from "@/lib/enterprise-ai/pharmacy-tools";
import { assertEnterpriseAiMessageQuota, getEnterpriseAiUsageSnapshot, recordEnterpriseAiUsage } from "@/lib/enterprise-ai/usage";
import { enterpriseAiChatSchema } from "@/lib/enterprise-ai/validators";
import { createOpenAIResponseStream } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const jsonValue = (value: unknown) => value as Prisma.InputJsonValue;
export const maxDuration = 60;

function parseOpenAIEvent(block: string) {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("");

  if (!data || data === "[DONE]") {
    return null;
  }

  return JSON.parse(data) as {
    type?: string;
    delta?: string;
    response?: {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_chat_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-chat:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de messages IA envoyés en peu de temps." }, { status: 429 });
  }

  const parsed = enterpriseAiChatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Le message IA Entreprise est invalide." }, { status: 400 });
  }

  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès non autorisé à l'IA Assistant Entreprise." }, { status: 403 });
  }

  const quota = await assertEnterpriseAiMessageQuota(data.organizationId, session.userId, access);
  if (!quota.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, reason: "enterprise_ai_quota" } });
    return NextResponse.json({ error: "MONTHLY_LIMIT_REACHED", message: "Le quota mensuel de messages IA de cette entreprise est atteint.", usage: quota.snapshot }, { status: 429 });
  }

  try {
    const existingConversationId = data.conversationId || null;
    const conversation = existingConversationId
      ? await prisma.enterpriseAiConversation.findFirst({
          where: { id: existingConversationId, organizationId: data.organizationId, userId: session.userId, status: "ACTIVE", deletedAt: null },
          select: { id: true, title: true },
        })
      : await prisma.enterpriseAiConversation.create({
          data: {
            organizationId: data.organizationId,
            assistantId: access.assistantId,
            userId: session.userId,
            title: data.content.slice(0, 90),
            lastMessageAt: new Date(),
          },
          select: { id: true, title: true },
        });

    if (!conversation) {
      await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
      return NextResponse.json({ error: "Conversation not found", message: "Conversation IA introuvable." }, { status: 404 });
    }

    await prisma.enterpriseAiMessage.create({
      data: {
        organizationId: data.organizationId,
        conversationId: conversation.id,
        userId: session.userId,
        role: "user",
        content: data.content,
        tokenHint: Math.ceil(data.content.length / 4),
      },
    });

    const [knowledge, toolResults] = await Promise.all([
      data.useKnowledge
        ? retrieveEnterpriseAiKnowledge({
            organizationId: data.organizationId,
            question: data.content,
            sectorCode: access.sectorCode,
            moduleCode: null,
            canReadSensitive: access.canManageSources,
          })
        : Promise.resolve({ context: "", citations: [] }),
      data.useTools && access.canUseReadTools && access.sectorCode === "PHARMACY" ? runPharmacyReadTools(data.organizationId, data.content) : Promise.resolve([]),
    ]);

    if (toolResults.length) {
      await prisma.enterpriseAiToolCall.createMany({
        data: toolResults.map((result) => ({
          organizationId: data.organizationId,
          assistantId: access.assistantId,
          conversationId: conversation.id,
          userId: session.userId,
          toolName: result.toolName,
          toolType: "READ",
          status: "SUCCESS",
          inputJson: jsonValue({ question: data.content }),
          outputJson: jsonValue(result),
        })),
      });
    }

    const previousMessages = await prisma.enterpriseAiMessage.findMany({
      where: { organizationId: data.organizationId, conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });
    const instructions = await buildEnterpriseAiInstructions(access);
    const prompt = buildEnterpriseAiPrompt({
      question: data.content,
      knowledgeContext: knowledge.context,
      citations: knowledge.citations,
      toolResults,
    });
    const openAIStream = await createOpenAIResponseStream({
      model: data.model || undefined,
      instructions,
      messages: [
        ...previousMessages.reverse().map((historyMessage) => ({
          role: historyMessage.role === "assistant" ? "assistant" as const : "user" as const,
          content: historyMessage.content,
        })),
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
        let usage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };

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
                usage = {
                  inputTokens: event.response.usage.input_tokens ?? 0,
                  outputTokens: event.response.usage.output_tokens ?? 0,
                  totalTokens: event.response.usage.total_tokens ?? 0,
                };
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
                model: data.model || null,
                citationsJson: jsonValue(knowledge.citations.map((citation) => ({
                  sourceId: citation.sourceId,
                  title: citation.title,
                  confidentiality: citation.confidentiality,
                  distance: citation.distance,
                }))),
                toolResultsJson: jsonValue(toolResults),
                tokenHint: Math.ceil(assistantContent.length / 4),
              },
            });

            await Promise.all([
              prisma.enterpriseAiConversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date(), title: conversation.title === "Nouvelle conversation" ? data.content.slice(0, 90) : undefined },
              }),
              recordEnterpriseAiUsage({
                organizationId: data.organizationId,
                assistantId: access.assistantId,
                conversationId: conversation.id,
                userId: session.userId,
                inputTokens: usage.inputTokens || Math.ceil(prompt.length / 4),
                outputTokens: usage.outputTokens || Math.ceil(assistantContent.length / 4),
              }),
              writeAuditLog({
                userId: session.userId,
                action: "ENTERPRISE_AI_CHAT_COMPLETED",
                entity: "EnterpriseAiConversation",
                entityId: conversation.id,
                request: req,
                metadata: { organizationId: data.organizationId, toolCount: toolResults.length, citationCount: knowledge.citations.length },
              }),
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Conversation-Id": conversation.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enterprise AI chat failed";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, message } });
    return NextResponse.json({ error: "Enterprise AI failed", message: "L'assistant IA Entreprise est momentanément indisponible." }, { status: 500 });
  }
}
