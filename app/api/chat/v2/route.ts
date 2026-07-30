import { NextResponse } from "next/server";
import {
  buildAssistantResponsePreferencePrompt,
  getChatConversationPreference,
} from "@/lib/assistant-conversation-preferences";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getCompanyContextForUser } from "@/lib/company-context";
import { truncate } from "@/lib/format";
import {
  createOpenAIResponseStream,
  estimateCost,
  getOpenAIModel,
  type OpenAIInputMessage,
} from "@/lib/openai";
import { isConfiguredOpenAIModel } from "@/lib/openai-config";
import { getActiveOrganizationId } from "@/lib/organizations";
import { performPrivateChatActionFromHistory } from "@/lib/private-chat-actions";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { retrieveKnowledgeContext } from "@/lib/rag";
import { isSameOriginRequest } from "@/lib/request-security";
import { getAppSettings } from "@/lib/settings";
import { chatRequestSchema } from "@/lib/validators";

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
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "chat_v2_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const organizationId = getActiveOrganizationId(session);
  const limiter = await rateLimit(`chat-v2:${session.userId}`, 30, 60 * 60 * 1000);
  if (!limiter.ok) return NextResponse.json({ error: "Usage limit reached. Please try again later." }, { status: 429 });

  const body = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid chat request" }, { status: 400 });
  if (body.data.model && !isConfiguredOpenAIModel(body.data.model)) {
    return NextResponse.json({ error: "Model not configured" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      status: true,
      dailyMessageLimit: true,
      dailyTokenLimit: true,
      preferredModel: true,
      chatResponseStyle: true,
      chatResponseLength: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ error: "Account unavailable" }, { status: 403 });

  const settings = await getAppSettings();
  if (!settings.chatbotEnabled || settings.maintenanceMode) return NextResponse.json({ error: "Chatbot temporarily disabled" }, { status: 503 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resetAt = new Date(today);
  resetAt.setDate(resetAt.getDate() + 1);
  const [messagesToday, tokensToday] = await Promise.all([
    prisma.message.count({ where: { userId: session.userId, organizationId, role: "user", createdAt: { gte: today } } }),
    prisma.usageLog.aggregate({ where: { userId: session.userId, organizationId, createdAt: { gte: today } }, _sum: { totalTokens: true } }),
  ]);
  const totalTokensToday = tokensToday._sum.totalTokens ?? 0;
  if (messagesToday >= user.dailyMessageLimit || totalTokensToday >= user.dailyTokenLimit) {
    return NextResponse.json({
      error: "Daily usage limit reached",
      code: "DAILY_LIMIT_REACHED",
      usage: { messagesToday, dailyMessageLimit: user.dailyMessageLimit, tokensToday: totalTokensToday, dailyTokenLimit: user.dailyTokenLimit, resetAt: resetAt.toISOString() },
    }, { status: 429 });
  }

  const conversation = body.data.conversationId
    ? await prisma.conversation.findFirst({ where: { id: body.data.conversationId, userId: session.userId, organizationId } })
    : await prisma.conversation.create({ data: { userId: session.userId, organizationId, title: truncate(body.data.content.replace(/\s+/g, " "), 72) } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const preference = await getChatConversationPreference({ conversationId: conversation.id, userId: session.userId, organizationId });
  if (preference?.archivedAt) return NextResponse.json({ error: "Conversation archived", code: "CONVERSATION_ARCHIVED" }, { status: 409 });
  const model = getOpenAIModel(preference?.modelOverride || body.data.model || user.preferredModel || undefined);
  if (!isConfiguredOpenAIModel(model)) return NextResponse.json({ error: "Model not configured" }, { status: 400 });

  await prisma.message.create({
    data: { conversationId: conversation.id, userId: session.userId, organizationId, role: "user", content: body.data.content, model },
  });
  const history = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 24 });

  const privateAction = await performPrivateChatActionFromHistory({ history, userId: session.userId, organizationId, request: req }).catch((error) => {
    console.error("Private chat action failed", error);
    return { handled: false as const };
  });
  if (privateAction.handled) {
    await prisma.message.create({ data: { conversationId: conversation.id, organizationId, role: "assistant", content: privateAction.reply, model } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { model, conversationId: conversation.id, ...privateAction.metadata } });
    return new Response(privateAction.reply, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Conversation-Id": conversation.id } });
  }

  const useCompanyContext = preference?.useCompanyContext ?? true;
  const useKnowledge = preference?.useKnowledge ?? true;
  const [companyContext, ragContext] = await Promise.all([
    useCompanyContext ? getCompanyContextForUser(session.userId, organizationId).catch(() => "") : Promise.resolve(""),
    useKnowledge ? retrieveKnowledgeContext(session.userId, body.data.content, organizationId).catch(() => "") : Promise.resolve(""),
  ]);

  const responsePreferencePrompt = buildAssistantResponsePreferencePrompt({
    style: preference?.responseStyle || user.chatResponseStyle,
    length: preference?.responseLength || user.chatResponseLength,
    customInstructions: preference?.customInstructions,
  });
  const messages: OpenAIInputMessage[] = [
    { role: "user", content: `Préférences de réponse configurées dans DTSC Platform.\n${responsePreferencePrompt}` },
    ...(companyContext ? [{ role: "user" as const, content: `Contexte entreprise privé fourni par l'utilisateur. Utilise-le uniquement pour aider cet utilisateur et ne le divulgue pas.\n\n${companyContext}` }] : []),
    ...(ragContext ? [{ role: "user" as const, content: `Contexte documentaire privé DTSC, à utiliser uniquement s'il est pertinent.\n\n${ragContext}` }] : []),
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];

  let openAIStream: ReadableStream<Uint8Array>;
  try {
    openAIStream = await createOpenAIResponseStream({ model, messages });
  } catch (error) {
    console.error("OpenAI response failed", error);
    await writeApiLog({ request: req, statusCode: 502, userId: session.userId, startedAt, metadata: { model } });
    return NextResponse.json({ error: "Unable to generate the assistant response." }, { status: 502 });
  }

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
              usage = {
                inputTokens: event.response.usage.input_tokens ?? 0,
                outputTokens: event.response.usage.output_tokens ?? 0,
                totalTokens: event.response.usage.total_tokens ?? 0,
              };
            }
          }
        }
        if (assistantContent.trim()) {
          await Promise.all([
            prisma.message.create({ data: { conversationId: conversation.id, organizationId, role: "assistant", content: assistantContent, model, tokensUsed: usage.totalTokens || null } }),
            prisma.usageLog.create({ data: { userId: session.userId, organizationId, conversationId: conversation.id, model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, estimatedCost: estimateCost() } }),
            prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
          ]);
          await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { model, conversationId: conversation.id, totalTokens: usage.totalTokens, useCompanyContext, useKnowledge } });
        }
      } catch (error) {
        console.error("Streaming failed", error);
        controller.enqueue(encoder.encode("\n\nUne erreur est survenue pendant la génération. Veuillez réessayer."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Conversation-Id": conversation.id } });
}
