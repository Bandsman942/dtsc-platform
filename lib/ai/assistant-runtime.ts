import { buildAiCagPack } from "@/lib/ai/cag-registry";
import { registerBuiltInCagBuilders } from "@/lib/ai/cag-builders";
import { buildAiExecutionContext } from "@/lib/ai/context-engine";
import { getAiPromptVersion } from "@/lib/ai/prompts";
import type { AiContextCode } from "@/lib/ai/types";

export async function prepareAiTurn({
  userId,
  contextCode,
  organizationId,
  assistantCode,
  moduleCode,
}: {
  userId: string;
  contextCode: AiContextCode;
  organizationId?: string | null;
  assistantCode?: string | null;
  moduleCode?: string | null;
}) {
  registerBuiltInCagBuilders();
  const executionContext = await buildAiExecutionContext({
    userId,
    contextCode,
    organizationId,
    requestedAssistantCode: assistantCode,
    requestedModuleCode: moduleCode,
  });
  const cag = await buildAiCagPack(executionContext);
  const promptVersion = getAiPromptVersion(executionContext.profile.promptCode as "GLOBAL_ASSISTANT" | "ENTERPRISE_ASSISTANT");

  return {
    executionContext,
    cag,
    routePolicy: {
      assistantCode: executionContext.profile.code,
      planCode: executionContext.planCode,
      dataClassifications: executionContext.defaultDataClassifications,
    },
    auditMetadata: {
      assistantProfileCode: executionContext.profile.code,
      assistantProfileVersion: executionContext.profile.version,
      profileResolution: executionContext.profileResolution,
      cagCode: cag.code,
      cagVersion: cag.version,
      cagCacheHit: cag.cacheHit,
      contextVersion: executionContext.contextVersion,
      promptCode: executionContext.profile.promptCode,
      promptVersion: promptVersion?.version || null,
    },
  };
}
