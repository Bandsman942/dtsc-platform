import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  buildAssistantResponsePreferencePrompt,
  getEnterpriseAiConversationPreference,
} from "@/lib/assistant-conversation-preferences";
import { createInteractiveAiAgentStream } from "@/lib/ai/agent/runtime";
import { prepareAiTurn } from "@/lib/ai/assistant-runtime";
import { classifyAiTask } from "@/lib/ai/classifier";
import { getAiModelDefinition } from "@/lib/ai/catalog";
import { toAiReasonCode } from "@/lib/ai/errors";
import { getAiErrorMessage } from "@/lib/ai/i18n";
import { buildLanguageInstruction } from "@/lib/ai/prompts";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { buildEnterpriseAiInstructions, buildEnterpriseAiPrompt } from "@/lib/enterprise-ai/context";
import { retrieveEnterpriseAiKnowledge } from "@/lib/enterprise-ai/knowledge";
import {
  assertEnterpriseAiMessageQuota,
  getEnterpriseAiUsageSnapshot,
  recordEnterpriseAiUsage,
} from "@/lib/enterprise-ai/usage";
import { enterpriseAiChatSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const maxDuration = 60;

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_agent_origin_denied" } });
    return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED", reasonCode: "UNAUTHORIZED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-agent:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", reasonCode: "RATE_LIMITED" }, { status: 429 });

  const parsed = enterpriseAiChatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", reasonCode: "INVALID_REQUEST" }, { status: 400 });
  const data = parsed.data;
  if (data.model && !getAiModelDefinition(data.model)) {
    return NextResponse.json({ error: "MODEL_UNAVAILABLE", reasonCode: "MODEL_UNAVAILABLE" }, { status: 400 });
  }

  const [access, user] = await Promise.all([
    getEnterpriseAiAccess(session, data.organizationId, "chat"),
    prisma.user.findUnique({ where: { id: session.userId }, select: { locale: true } }),
  ]);
  const locale = user?.locale === "en" ? "en" : "fr";
  if (!access) return NextResponse.json({ error: "FORBIDDEN", reasonCode: "FORBIDDEN" }, { status: 403 });

  const quota = await assertEnterpriseAiMessageQuota(data.organizationId, session.userId, access);
  if (!quota.ok) {
    return NextResponse.json({ error: "MONTHLY_LIMIT_REACHED", reasonCode: "MONTHLY_LIMIT_REACHED", usage: quota.snapshot }, { status: 429 });
  }

  try {
    const existingConversationId = data.conversationId || null;
    const conversation = existingConversationId
      ? await prisma.enterpriseAiConversation.findFirst({
          where: {
            id: existingConversationId,
            organizationId: data.organizationId,
            userId: session.userId,
            status: "ACTIVE",
            deletedAt: null,
          },
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
    if (!conversation) return NextResponse.json({ error: "CONVERSATION_NOT_FOUND", reasonCode: "CONVERSATION_NOT_FOUND" }, { status: 404 });

    if (!existingConversationId) {
      await prisma.enterpriseAiConversationPreference.upsert({
        where: { conversationId: conversation.id },
        update: {},
        create: {
          conversationId: conversation.id,
          organizationId: data.organizationId,
          userId: session.userId,
          modelOverride: data.model || null,
          useKnowledge: data.useKnowledge,
          useTools: data.useTools,
        },
      });
    }

    const preference = await getEnterpriseAiConversationPreference({
      conversationId: conversation.id,
      organizationId: data.organizationId,
      userId: session.userId,
    });
    const requestedModel = preference?.modelOverride || data.model || undefined;
    if (requestedModel && !getAiModelDefinition(requestedModel)) {
      return NextResponse.json({ error: "MODEL_UNAVAILABLE", reasonCode: "MODEL_UNAVAILABLE" }, { status: 400 });
    }
    const useKnowledge = preference?.useKnowledge ?? data.useKnowledge;
    const useTools = preference?.useTools ?? data.useTools;
    const preparedTurn = await prepareAiTurn({ userId: session.userId, contextCode: "ORGANIZATION", organizationId: data.organizationId });

    await prisma.enterpriseAiMessage.create({
      data: {
        organizationId: data.organizationId,
        conversationId: conversation.id,
        userId: session.userId,
        role: "user",
        content: data.content,
        model: requestedModel || null,
        tokenHint: Math.ceil(data.content.length / 4),
      },
    });

    const knowledge = useKnowledge
      ? await retrieveEnterpriseAiKnowledge({
          organizationId: data.organizationId,
          question: data.content,
          sectorCode: access.sectorCode,
          moduleCode: null,
          canReadSensitive: access.canManageSources,
          queryLocale: locale,
        })
      : { context: "", citations: [], dataClassifications: [] };
    const routeDataClassifications = Array.from(new Set([...preparedTurn.routePolicy.dataClassifications, ...knowledge.dataClassifications]));
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
    const instructions = `${baseInstructions}\n\n${buildLanguageInstruction(locale)}\n\nPréférences de cette conversation:\n${preferenceInstructions}\n\nMode agent DTSC: utilise uniquement les outils certifiés exposés par le runtime. N'invente jamais un résultat d'outil et n'essaie jamais de t'auto-confirmer.`;
    const prompt = buildEnterpriseAiPrompt({ question: data.content, knowledgeContext: knowledge.context, citations: knowledge.citations, toolResults: [] });
    const messages = [
      ...previousMessages.reverse().map((historyMessage) => ({
        role: historyMessage.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: historyMessage.content,
      })),
      { role: "user" as const, content: prompt },
    ];
    const taskType = classifyAiTask(data.content);
    const sessionUserId = session.userId;
    const conversationId = conversation.id;
    const conversationTitle = conversation.title;

    const agent = await createInteractiveAiAgentStream({
      session,
      userId: sessionUserId,
      organizationId: data.organizationId,
      scope: "ENTERPRISE_CHAT",
      contextCode: "ORGANIZATION",
      locale,
      messages,
      instructions,
      taskType,
      assistantCode: preparedTurn.routePolicy.assistantCode,
      enterpriseConversationId: conversationId,
      requestedModel,
      dataClassifications: routeDataClassifications,
      budgetRequest: useTools ? undefined : { maxToolCalls: 0, allowedToolModes: [], allowedToolCodes: [] },
      request: req,
      signal: req.signal,
      tags: [
        "feature:enterprise-assistant",
        "execution:agent-v1",
        `assistant:${preparedTurn.executionContext.profile.code}`,
        `organization:${data.organizationId}`,
        `locale:${locale}`,
      ],
      onFinished: async (result) => {
        const model = result.modelCode || requestedModel || "AGENT_V1";
        const inputTokens = result.usage.inputTokens || Math.ceil(prompt.length / 4);
        const outputTokens = result.usage.outputTokens || Math.ceil(result.content.length / 4);
        const writes: Promise<unknown>[] = [
          recordEnterpriseAiUsage({
            organizationId: data.organizationId,
            assistantId: access.assistantId,
            conversationId,
            userId: sessionUserId,
            inputTokens,
            outputTokens,
            estimatedCost: result.usage.estimatedCost,
          }),
          writeAuditLog({
            userId: sessionUserId,
            action: result.status === "COMPLETED" ? "ENTERPRISE_AI_AGENT_COMPLETED" : `ENTERPRISE_AI_AGENT_${result.status}`,
            entity: "EnterpriseAiConversation",
            entityId: conversationId,
            request: req,
            metadata: {
              organizationId: data.organizationId,
              runId: result.runId,
              modelCode: result.modelCode || null,
              providerCode: result.providerCode || null,
              citationCount: knowledge.citations.length,
              dataClassifications: routeDataClassifications,
              useKnowledge,
              useTools,
              taskType,
              reasonCode: result.reasonCode || null,
              ...preparedTurn.auditMetadata,
            },
          }),
        ];
        if (result.content.trim()) {
          writes.push(
            prisma.enterpriseAiMessage.create({
              data: {
                organizationId: data.organizationId,
                conversationId,
                role: "assistant",
                content: result.content,
                model,
                citationsJson: jsonValue(
                  knowledge.citations.map((citation) => ({
                    sourceId: citation.sourceId,
                    title: citation.title,
                    confidentiality: citation.confidentiality,
                    dataClassification: citation.dataClassification,
                    sourceVersion: citation.sourceVersion,
                    indexVersion: citation.indexVersion,
                    language: citation.language,
                    pageNumber: citation.pageNumber,
                    section: citation.section,
                    distance: citation.distance,
                    hybridScore: citation.hybridScore,
                  })),
                ),
                toolResultsJson: jsonValue([]),
                tokenHint: outputTokens,
              },
            }),
            prisma.enterpriseAiConversation.update({
              where: { id: conversationId },
              data: { lastMessageAt: new Date(), title: conversationTitle === "Nouvelle conversation" ? data.content.slice(0, 90) : undefined },
            }),
          );
        }
        await Promise.all(writes);
        await getEnterpriseAiUsageSnapshot(data.organizationId, sessionUserId, access);
        await writeApiLog({
          request: req,
          statusCode: result.status === "FAILED" ? 502 : result.status === "CANCELLED" ? 499 : 200,
          userId: sessionUserId,
          startedAt,
          metadata: {
            action: "enterprise_ai_agent_finished",
            organizationId: data.organizationId,
            conversationId,
            runId: result.runId,
            status: result.status,
            totalTokens: inputTokens + outputTokens,
            estimatedCost: result.usage.estimatedCost,
            reasonCode: result.reasonCode || null,
            ...preparedTurn.auditMetadata,
          },
        });
      },
    });

    return new Response(agent.stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Conversation-Id": conversationId,
        "X-AI-Execution": "AGENT_V1",
        "X-AI-Agent-Run-Id": agent.runId,
        "X-AI-Assistant": preparedTurn.executionContext.profile.code,
      },
    });
  } catch (error) {
    const reasonCode = toAiReasonCode(error);
    await writeApiLog({
      request: req,
      statusCode: 502,
      userId: session.userId,
      startedAt,
      metadata: { action: "enterprise_ai_agent_failed", organizationId: data.organizationId, reasonCode },
    });
    return NextResponse.json({ error: reasonCode, reasonCode, message: getAiErrorMessage(reasonCode, locale) }, { status: 502 });
  }
}
