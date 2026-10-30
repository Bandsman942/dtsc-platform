import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { getAiModelCatalog, getAiProviderCatalog, listAvailableAiModels } from "@/lib/ai/catalog";
import { SERVER_LIMITS } from "@/lib/ai/agent/policy";
import { aiPlatformPolicyInputSchema, getAiPlatformPolicy } from "@/lib/ai/platform-runtime-policy";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.AI_READ);
  if (access.response) return access.response;
  try {
    const [policy, changes] = await Promise.all([
      getAiPlatformPolicy(),
      prisma.platformSettingHistory.findMany({
        where: { settingCode: "AI_RUNTIME_POLICY" },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, reason: true, nextValue: true },
        take: 20,
      }),
    ]);
    return NextResponse.json({ policy, changes, reasonCode: access.reasonCode });
  } catch {
    return NextResponse.json({ error: "Configuration IA indisponible", reasonCode: "AI_POLICY_UNAVAILABLE" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.AI_MANAGE);
  if (access.response) return access.response;

  const parsed = aiPlatformPolicyInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres IA invalides", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const { expectedRevision, disabledProviderCodes, disabledModelCodes, agentCeilings, reason } = parsed.data;
  const assistantSettings = parsed.data.assistantSettings ?? (await getAiPlatformPolicy()).assistantSettings;
  const providerCodes = new Set(getAiProviderCatalog().map((p) => p.code));
  const modelCodes = new Set(getAiModelCatalog().map((m) => m.code));
  if (disabledProviderCodes.some((code) => !providerCodes.has(code)) || disabledModelCodes.some((code) => !modelCodes.has(code))) {
    return NextResponse.json({ error: "Modèle ou fournisseur absent du catalogue DTSC", reasonCode: "AI_POLICY_CATALOG_UNKNOWN" }, { status: 400 });
  }

  const eligiblePublicModels = new Set(listAvailableAiModels({
    context: "PERSONAL", locale: "fr", taskType: "GENERAL_CHAT",
    planCode: "STARTER", dataClassifications: ["PUBLIC"], requiredCapabilities: { text: true, tools: true },
  }).map((model) => model.code));
  if (assistantSettings.landingModelCodes.some((code) => !eligiblePublicModels.has(code) || disabledModelCodes.includes(code))) {
    return NextResponse.json({ error: "Sélectionnez uniquement des modèles publics certifiés, configurés et autorisés pour Starter.", reasonCode: "AI_PUBLIC_MODEL_NOT_ALLOWED" }, { status: 400 });
  }

  for (const code of ["STARTER", "BUSINESS", "ENTERPRISE"] as const) {
    const request = agentCeilings[code];
    if (!request) continue;
    const ceiling = SERVER_LIMITS[code];
    for (const field of ["maxSteps", "maxToolCalls", "maxTokens", "maxEstimatedCost", "maxDurationMs"] as const) {
      if (request[field] !== undefined && request[field] > ceiling[field]) {
        return NextResponse.json({ error: "Le plafond dépasse la limite de sécurité du serveur", reasonCode: "AI_POLICY_SERVER_LIMIT_EXCEEDED", details: { tier: code, field } }, { status: 400 });
      }
    }
  }
  const inputJson = {
    disabledProviderCodes,
    disabledModelCodes,
    agentCeilings,
    assistantSettings,
  };
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-vercel-id") || null;
  try {
    const nextRevision = await prisma.$transaction(async (tx) => {
      const existing = await tx.aiPlatformRuntimePolicy.findUnique({ where: { id: "global" } });
      if ((existing?.revision || 0) !== expectedRevision) throw new Error("REVISION_CONFLICT");
      const data = {
        disabledProviderCodes: disabledProviderCodes as Prisma.InputJsonValue,
        disabledModelCodes: disabledModelCodes as Prisma.InputJsonValue,
        agentCeilings: agentCeilings as Prisma.InputJsonValue,
        assistantSettings: assistantSettings as Prisma.InputJsonValue,
        updatedByUserId: access.session.userId,
      };
      const updated = existing
        ? await tx.aiPlatformRuntimePolicy.updateMany({ where: { id: "global", revision: expectedRevision }, data: { ...data, revision: { increment: 1 } } })
        : await tx.aiPlatformRuntimePolicy.create({ data: { id: "global", revision: 1, ...data } });
      if (existing && updated && "count" in updated && updated.count !== 1) throw new Error("REVISION_CONFLICT");
      await tx.platformSettingHistory.create({
        data: {
          settingCode: "AI_RUNTIME_POLICY",
          category: "AI",
          valueType: "OBJECT",
          previousValue: existing ? { disabledProviderCodes: existing.disabledProviderCodes, disabledModelCodes: existing.disabledModelCodes, agentCeilings: existing.agentCeilings, assistantSettings: existing.assistantSettings, revision: existing.revision } as Prisma.InputJsonValue : Prisma.JsonNull,
          nextValue: { ...inputJson, revision: expectedRevision + 1 } as Prisma.InputJsonValue,
          sensitive: false,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "PRODUCTION",
          effect: "AI_POLICY_UPDATED",
          restartRequired: false,
          reason,
          actorUserId: access.session.userId,
          requestId,
        },
      });
      return expectedRevision + 1;
    });
    await writeAuditLog({
      userId: access.session.userId,
      action: "AI_RUNTIME_POLICY_UPDATED",
      entity: "AiPlatformRuntimePolicy",
      entityId: "global",
      riskLevel: "HIGH",
      requestId,
      reasonCode: "AI_POLICY_UPDATED",
      before: { revision: expectedRevision },
      after: { ...inputJson, revision: nextRevision },
      metadata: { reason, policyVersion: nextRevision },
      request: req,
    });
    return NextResponse.json({ ok: true, policy: { ...inputJson, revision: nextRevision }, reasonCode: "AI_POLICY_UPDATED" });
  } catch (error) {
    if ((error instanceof Error && error.message === "REVISION_CONFLICT") || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      return NextResponse.json({ error: "La politique a été modifiée entre-temps. Actualisez avant de réessayer.", reasonCode: "REVISION_CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: "Enregistrement de la politique IA indisponible", reasonCode: "AI_POLICY_UPDATE_FAILED" }, { status: 503 });
  }
}
