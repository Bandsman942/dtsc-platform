import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { buildAssistantResponsePreferencePrompt, getEnterpriseAiConversationPreference } from "@/lib/assistant-conversation-preferences";
import { prepareAiTurn } from "@/lib/ai/assistant-runtime";
import { classifyAiTask } from "@/lib/ai/classifier";
import { getAiModelDefinition } from "@/lib/ai/catalog";
import { estimateAiCost } from "@/lib/ai/costs";
import { AiProviderError, toAiReasonCode } from "@/lib/ai/errors";
import { getAiErrorMessage } from "@/lib/ai/i18n";
import { completeAiModelCall, failAiModelCall, interruptAiModelCall, startAiModelCall } from "@/lib/ai/observability";
import { routeAiStream } from "@/lib/ai/orchestrator";
import { buildLanguageInstruction } from "@/lib/ai/prompts";
import { createAuditedAiTextStream, type AiStreamConsumption } from "@/lib/ai/stream";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { buildEnterpriseAiInstructions, buildEnterpriseAiPrompt } from "@/lib/enterprise-ai/context";
import { retrieveEnterpriseAiKnowledge } from "@/lib/enterprise-ai/knowledge";
import { runPharmacyReadTools } from "@/lib/enterprise-ai/pharmacy-tools";
import { assertEnterpriseAiMessageQuota, getEnterpriseAiUsageSnapshot, recordEnterpriseAiUsage } from "@/lib/enterprise-ai/usage";
import { enterpriseAiChatSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const maxDuration = 60;

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_chat_origin_denied" } });
    return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED", reasonCode: "UNAUTHORIZED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-chat:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", reasonCode: "RATE_LIMITED" }, { status: 429 });
  const parsed = enterpriseAiChatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", reasonCode: "INVALID_REQUEST" }, { status: 400 });
  const data = parsed.data;
  if (data.model && !getAiModelDefinition(data.model)) return NextResponse.json({ error: "MODEL_UNAVAILABLE", reasonCode: "MODEL_UNAVAILABLE" }, { status: 400 });

  const [access, user] = await Promise.all([
    getEnterpriseAiAccess(session, data.organizationId, "chat"),
    prisma.user.findUnique({ where: { id: session.userId }, select: { locale: true } }),
  ]);
  const locale = user?.locale === "en" ? "en" : "fr";
  if (!access) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });
  const quota = await assertEnterpriseAiMessageQuota(data.organizationId, session.userId, access);
  if (!quota.ok) return NextResponse.json({ error: "MONTHLY_LIMIT_REACHED", reasonCode: "MONTHLY_LIMIT_REACHED", usage: quota.snapshot }, { status: 429 });

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
    if (!conversation) return NextResponse.json({ error: "CONVERSATION_NOT_FOUND", reasonCode: "CONVERSATION_NOT_FOUND" }, { status: 404 });

    if (!existingConversationId) {
      await prisma.enterpriseAiConversationPreference.upsert({
        where: { conversationId: conversation.id },
        update: {},
        create: { conversationId: conversation.id, organizationId: data.organizationId, userId: session.userId, modelOverride: data.model || null, useKnowledge: data.useKnowledge, useTools: data.useTools },
      });
    }
    const preference = await getEnterpriseAiConversationPreference({ conversationId: conversation.id, organizationId: data.organizationId, userId: session.userId });
    const requestedModel = preference?.modelOverride || data.model || undefined;
    if (requestedModel && !getAiModelDefinition(requestedModel)) return NextResponse.json({ error: "MODEL_UNAVAILABLE", reasonCode: "MODEL_UNAVAILABLE" }, { status: 400 });
    const useKnowledge = preference?.useKnowledge ?? data.useKnowledge;
    const useTools = preference?.useTools ?? data.useTools;

    const preparedTurn = await prepareAiTurn({
      userId: session.userId,
      contextCode: "ORGANIZATION",
      organizationId: data.organizationId,
    });

    await prisma.enterpriseAiMessage.create({
      data: { organizationId: data.organizationId, conversationId: conversation.id, userId: session.userId, role: "user", content: data.content, model: requestedModel || null, tokenHint: Math.ceil(data.content.length / 4) },
    });

    const [knowledge, toolResults] = await Promise.all([
      useKnowledge
        ? retrieveEnterpriseAiKnowledge({ organizationId: data.organizationId, question: data.content, sectorCode: access.sectorCode, moduleCode: null, canReadSensitive: access.canManageSources, queryLocale: locale })
        : Promise.resolve({ context: "", citations: [] }),
      useTools && access.canUseReadTools && access.sectorCode === "PHARMACY" ? runPharmacyReadTools(data.organizationId, data.content) : Promise.resolve([]),
    ]);

    if (toolResults.length) {
      await prisma.enterpriseAiToolCall.createMany({
        data: toolResults.map((result) => ({ organizationId: data.organizationId, assistantId: access.assistantId, conversationId: conversation.id, userId: session.userId, toolName: result.toolName, toolType: "READ", status: "SUCCESS", inputJson: jsonValue({ question: data.content, locale }), outputJson: jsonValue(result) })),
      });
    }

    const previousMessages = await prisma.enterpriseAiMessage.findMany({
      where: { organizationId: data.organizationId, conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true },
    });
    const baseInstructions = buildEnterpriseAiInstructions(access, {
      assistantProfileCode: preparedTurn.executionContext.profile.code,
      assistantProfileVersion: preparedTurn.executionContext.profile.version,
      cagContent: preparedTurn.cag.content,
      cagVersion: preparedTurn.cag.version,
    });
    const preferenceInstructions = buildAssistantResponsePreferencePrompt({
      style: preference?.responseStyle,
      length: preference?.responseLength,
      customInstructions: preference?.customInstructions,
    });
    const instructions = `${baseInstructions}\n\n${buildLanguageInstruction(locale)}\n\nPréférences de cette conversation:\n${preferenceInstructions}`;
    const prompt = buildEnterpriseAiPrompt({ question: data.content, knowledgeContext: knowledge.context, citations: knowledge.citations, toolResults });
    const messages = [
      ...previousMessages.reverse().map((historyMessage) => ({ role: historyMessage.role === "assistant" ? "assistant" as const : "user" as const, content: historyMessage.content })),
      { role: "user" as const, content: prompt },
    ];
    const taskType = classifyAiTask(data.content);

    let routed: Awaited<ReturnType<typeof routeAiStream>>;
    try {
      routed = await routeAiStream({
        requestedModel,
        taskType,
        context: "ORGANIZATION",
        locale,
        messages,
        instructions,
        userId: session.userId,
        organizationId: data.organizationId,
        assistantCode: preparedTurn.routePolicy.assistantCode,
        dataClassifications: preparedTurn.routePolicy.dataClassifications,
        tags: ["feature:enterprise-assistant", `assistant:${preparedTurn.executionContext.profile.code}`, `organization:${data.organizationId}`, `locale:${locale}`],
        signal: req.signal,
      });
    } catch (error) {
      const reasonCode = toAiReasonCode(error);
      const statusCode = error instanceof AiProviderError ? error.statusCode : 502;
      await writeApiLog({ request: req, statusCode, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, reasonCode, taskType, requestedModel, ...preparedTurn.auditMetadata } });
      return NextResponse.json({ error: reasonCode, reasonCode, message: getAiErrorMessage(reasonCode, locale) }, { status: statusCode });
    }

    const sessionUserId = session.userId;
    const authorizedAccess = access;
    const conversationId = conversation.id;
    const conversationTitle = conversation.title;

    const modelCall = await startAiModelCall({
      userId: sessionUserId,
      organizationId: data.organizationId,
      contextCode: "ORGANIZATION",
      locale,
      enterpriseConversationId: conversationId,
      selection: routed.selection,
      providerCode: routed.providerCode,
      providerModelId: routed.providerModelId,
      fallbackUsed: routed.fallbackUsed,
      attempts: routed.attempts,
      promptVersion: preparedTurn.auditMetadata.promptVersion,
      runtimeMetadata: preparedTurn.auditMetadata,
    });

    async function persistAssistant(result: AiStreamConsumption, completed: boolean) {
      const inputTokens = result.usage.inputTokens || Math.ceil(prompt.length / 4);
      const outputTokens = result.usage.outputTokens || Math.ceil(result.content.length / 4);
      const cost = estimateAiCost({ model: routed.selection.selectedModel, inputTokens, outputTokens, cachedInputTokens: result.usage.cachedInputTokens });
      const writes: Promise<unknown>[] = [];
      if (result.content.trim()) {
        writes.push(
          prisma.enterpriseAiMessage.create({
            data: {
              organizationId: data.organizationId,
              conversationId,
              role: "assistant",
              content: result.content,
              model: routed.modelCode,
              citationsJson: jsonValue(knowledge.citations.map((citation) => ({ sourceId: citation.sourceId, title: citation.title, confidentiality: citation.confidentiality, language: citation.language, pageNumber: citation.pageNumber, section: citation.section, distance: citation.distance }))),
              toolResultsJson: jsonValue(toolResults),
              tokenHint: outputTokens,
            },
          }),
          prisma.enterpriseAiConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), title: conversationTitle === "Nouvelle conversation" ? data.content.slice(0, 90) : undefined } }),
        );
      }
      writes.push(
        recordEnterpriseAiUsage({ organizationId: data.organizationId, assistantId: authorizedAccess.assistantId, conversationId, userId: sessionUserId, inputTokens, outputTokens, estimatedCost: cost.amount }),
        completed
          ? completeAiModelCall({ callId: modelCall.id, model: routed.selection.selectedModel, inputTokens, outputTokens, cachedInputTokens: result.usage.cachedInputTokens, durationMs: result.durationMs, firstTokenLatencyMs: result.firstTokenLatencyMs })
          : interruptAiModelCall(modelCall.id, result.durationMs),
        writeAuditLog({ userId: sessionUserId, action: completed ? "ENTERPRISE_AI_CHAT_COMPLETED" : "ENTERPRISE_AI_CHAT_INTERRUPTED", entity: "EnterpriseAiConversation", entityId: conversationId, request: req, metadata: { organizationId: data.organizationId, providerCode: routed.providerCode, modelCode: routed.modelCode, toolCount: toolResults.length, citationCount: knowledge.citations.length, useKnowledge, useTools, taskType, fallbackUsed: routed.fallbackUsed, locale, interrupted: !completed, ...preparedTurn.auditMetadata } }),
      );
      await Promise.all(writes);
      await getEnterpriseAiUsageSnapshot(data.organizationId, sessionUserId, authorizedAccess);
      await writeApiLog({ request: req, statusCode: completed ? 200 : 499, userId: sessionUserId, startedAt, metadata: { organizationId: data.organizationId, conversationId, providerCode: routed.providerCode, modelCode: routed.modelCode, totalTokens: inputTokens + outputTokens, taskType, fallbackUsed: routed.fallbackUsed, interrupted: !completed, ...preparedTurn.auditMetadata } });
    }

    const stream = createAuditedAiTextStream({
      source: routed.stream,
      signal: req.signal,
      interruptedMessage: getAiErrorMessage("STREAM_INTERRUPTED", locale),
      onCompleted: (result) => persistAssistant(result, true),
      onInterrupted: (result) => persistAssistant(result, false),
      onFailed: async (streamError, result) => {
        console.error("Enterprise AI streaming failed", streamError);
        await failAiModelCall(modelCall.id, "STREAM_INTERRUPTED", result.durationMs);
        await writeApiLog({ request: req, statusCode: 502, userId: sessionUserId, startedAt, metadata: { organizationId: data.organizationId, conversationId, reasonCode: "STREAM_INTERRUPTED", providerCode: routed.providerCode, modelCode: routed.modelCode, ...preparedTurn.auditMetadata } });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Conversation-Id": conversationId,
        "X-AI-Provider": routed.providerCode,
        "X-AI-Model": routed.modelCode,
        "X-AI-Task": taskType,
        "X-AI-Assistant": preparedTurn.executionContext.profile.code,
        "X-AI-Fallback": String(routed.fallbackUsed),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enterprise AI chat failed";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, message } });
    return NextResponse.json({ error: "UNKNOWN_PROVIDER_ERROR", reasonCode: "UNKNOWN_PROVIDER_ERROR", message: getAiErrorMessage("UNKNOWN_PROVIDER_ERROR", locale) }, { status: 500 });
  }
}
