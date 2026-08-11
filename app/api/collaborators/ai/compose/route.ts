import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareAiTurn } from "@/lib/ai/assistant-runtime";
import { classifyAiTask } from "@/lib/ai/classifier";
import { toAiReasonCode } from "@/lib/ai/errors";
import { getAiErrorMessage } from "@/lib/ai/i18n";
import { routeAiStream } from "@/lib/ai/orchestrator";
import { buildLanguageInstruction } from "@/lib/ai/prompts";
import type { AiProviderEvent } from "@/lib/ai/provider-events";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const requestSchema = z.object({
  action: z.enum(["REWRITE", "PROFESSIONAL", "SHORTEN", "FRIENDLY", "PROPOSE_REPLY"]),
  draft: z.string().max(6000).default(""),
  context: z.string().max(6000).optional().default(""),
}).strict().superRefine((value, ctx) => {
  if (value.action === "PROPOSE_REPLY") {
    if (!value.context.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["context"], message: "REPLY_CONTEXT_REQUIRED" });
    }
    return;
  }
  if (!value.draft.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["draft"], message: "DRAFT_REQUIRED" });
  }
});

function actionInstruction(action: z.infer<typeof requestSchema>["action"], locale: string) {
  const en = locale === "en";
  const map = en
    ? {
        REWRITE: "Rewrite the draft clearly while preserving the exact intent.",
        PROFESSIONAL: "Rewrite the draft in a professional, concise business tone.",
        SHORTEN: "Make the draft shorter without losing essential information.",
        FRIENDLY: "Rewrite the draft in a warm, natural and respectful tone.",
        PROPOSE_REPLY: "Draft a useful reply to the received message. Use the optional draft as the user's intended direction when present.",
      }
    : {
        REWRITE: "Reformule le brouillon clairement en conservant exactement l’intention.",
        PROFESSIONAL: "Reformule le brouillon dans un ton professionnel, concis et adapté au travail.",
        SHORTEN: "Raccourcis le brouillon sans perdre les informations essentielles.",
        FRIENDLY: "Reformule le brouillon dans un ton chaleureux, naturel et respectueux.",
        PROPOSE_REPLY: "Rédige une réponse utile au message reçu. Si un brouillon existe, utilise-le comme intention ou orientation de l’utilisateur.",
      };
  return map[action];
}

async function collectText(source: ReadableStream<AiProviderEvent>) {
  const reader = source.getReader();
  let content = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "TEXT_DELTA") content += value.text;
      if (value.type === "ERROR") throw new Error(value.reasonCode);
      if (value.type === "COMPLETED") break;
    }
  } finally {
    reader.releaseLock();
  }
  return content.trim();
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaborators_ai_compose_origin_denied" } });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const limited = await rateLimit(getRateLimitKey(req, `collaborators-ai-compose:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true, locale: true, preferredModel: true },
  });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 403 });

  const locale = user.locale === "en" ? "en" : "fr";
  const organizationId = getActiveOrganizationId(session);
  const contextCode = organizationId
    ? "ORGANIZATION" as const
    : session.activeContext === "DTSC_INTERNAL"
      ? "DTSC_INTERNAL" as const
      : "PERSONAL" as const;

  const preparedTurn = await prepareAiTurn({
    userId: session.userId,
    contextCode,
    organizationId,
    assistantCode: "DTSC_GENERAL",
  });

  const { action, draft, context } = parsed.data;
  const instructions = [
    "Tu es le copilote de rédaction intégré aux conversations de DTSC Platform.",
    actionInstruction(action, locale),
    "Retourne uniquement le texte final prêt à être relu par l’utilisateur, sans préambule, sans explication et sans guillemets.",
    "Ne prétends jamais avoir envoyé le message. L’envoi reste une action distincte de l’utilisateur.",
    buildLanguageInstruction(locale),
  ].join("\n");
  const input = action === "PROPOSE_REPLY"
    ? [
        locale === "en" ? "Received message:" : "Message reçu :",
        context.trim(),
        draft.trim() ? `\n${locale === "en" ? "User draft or intent:" : "Brouillon ou intention de l’utilisateur :"}\n${draft.trim()}` : "",
      ].join("\n")
    : draft.trim();

  try {
    const routed = await routeAiStream({
      requestedModel: user.preferredModel || undefined,
      taskType: classifyAiTask(input),
      context: contextCode,
      locale,
      messages: [{ role: "user", content: input }],
      instructions,
      userId: session.userId,
      organizationId,
      assistantCode: preparedTurn.routePolicy.assistantCode,
      dataClassifications: preparedTurn.routePolicy.dataClassifications,
      tags: ["feature:collaborators-ai-compose", `assistant:${preparedTurn.executionContext.profile.code}`, `action:${action}`],
      signal: req.signal,
    });
    const content = await collectText(routed.stream);
    if (!content) return NextResponse.json({ error: "EMPTY_RESPONSE" }, { status: 502 });

    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: {
        action: "collaborators_ai_compose",
        composeAction: action,
        organizationId,
        providerCode: routed.providerCode,
        modelCode: routed.modelCode,
        fallbackUsed: routed.fallbackUsed,
        ...preparedTurn.auditMetadata,
      },
    });
    return NextResponse.json({ content });
  } catch (error) {
    const reasonCode = toAiReasonCode(error);
    await writeApiLog({
      request: req,
      statusCode: 502,
      userId: session.userId,
      startedAt,
      metadata: { action: "collaborators_ai_compose_failed", reasonCode, organizationId, ...preparedTurn.auditMetadata },
    });
    return NextResponse.json({ error: reasonCode, message: getAiErrorMessage(reasonCode, locale) }, { status: 502 });
  }
}
