import { getAiToolDefinition } from "@/lib/ai/tool-registry";
import { getAiToolExecutor } from "@/lib/ai/tools/executors";
import { getAiToolInputSchema, getAiToolOutputSchema } from "@/lib/ai/tools/schemas";
import type { AiToolAuthorizationDecision, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { normalizePlanRequirement, planMeetsRequirement, resolveSaasPlanCode } from "@/lib/billing/plans";

function deny(reasonCode: AiToolAuthorizationDecision["reasonCode"], message: string): AiToolAuthorizationDecision {
  return { allowed: false, reasonCode, message };
}

function actionForToolMode(mode: string) {
  if (mode === "READ") return "read" as const;
  if (mode === "PREPARE") return "submit" as const;
  return "write" as const;
}

export async function authorizeAiTool(toolCode: string, context: AiToolRuntimeContext): Promise<AiToolAuthorizationDecision> {
  const definition = getAiToolDefinition(toolCode);
  if (!definition || !getAiToolInputSchema(toolCode) || !getAiToolOutputSchema(toolCode) || !getAiToolExecutor(toolCode)) {
    return deny("TOOL_NOT_REGISTERED", "Cet outil IA n’est pas disponible dans ce contexte.");
  }

  if (!definition.contexts.includes(context.session.activeContext)) {
    return deny("CONTEXT_NOT_ALLOWED", "Cet outil n’est pas autorisé dans l’espace actif.");
  }

  if (definition.allowedAssistantCodes?.length && (!context.assistantCode || !definition.allowedAssistantCodes.includes(context.assistantCode))) {
    return deny("ASSISTANT_NOT_ALLOWED", "Cet assistant ne peut pas utiliser cet outil.");
  }

  if (context.dataClassifications?.includes("SECRET")) {
    return deny("SENSITIVE_DATA_NOT_ALLOWED", "Les données classifiées SECRET ne peuvent pas être transmises à un outil IA.");
  }

  if (context.session.activeContext !== "ORGANIZATION") {
    return { allowed: true, reasonCode: "ALLOWED", message: "Accès autorisé." };
  }

  const organizationId = context.organizationId || context.session.activeOrganizationId;
  if (!organizationId || context.session.activeOrganizationId !== organizationId) {
    return deny("ORGANIZATION_CONTEXT_REQUIRED", "Un contexte entreprise actif est requis.");
  }

  const enterpriseAi = await getEnterpriseAiAccess(context.session, organizationId, "read");
  if (!enterpriseAi) {
    return deny("ENTERPRISE_AI_ACCESS_DENIED", "L’assistant IA entreprise n’est pas accessible.");
  }

  if (definition.mode === "READ" && !enterpriseAi.canUseReadTools) {
    return deny("TOOL_READ_DISABLED", "Les outils de lecture IA sont désactivés pour cette entreprise ou cet abonnement.");
  }
  if (definition.mode === "PREPARE" && !enterpriseAi.canUseActionDrafts) {
    return deny("TOOL_READ_DISABLED", "Les brouillons d’action IA sont désactivés pour cette entreprise ou cet abonnement.");
  }

  if (definition.allowedSectorCodes?.length && (!enterpriseAi.sectorCode || !definition.allowedSectorCodes.includes(enterpriseAi.sectorCode))) {
    return deny("SECTOR_NOT_ALLOWED", "Cet outil ne correspond pas au secteur de l’entreprise.");
  }

  const minimumPlan = normalizePlanRequirement(definition.minimumPlan);
  if (minimumPlan && !planMeetsRequirement(resolveSaasPlanCode({ slug: enterpriseAi.planCode, name: enterpriseAi.planCode }), minimumPlan)) {
    return deny("PLAN_NOT_ALLOWED", "L’abonnement actuel ne permet pas cet outil.");
  }

  const action = actionForToolMode(definition.mode);
  for (const moduleCode of definition.requiredModuleCodes) {
    const moduleDecision = await resolveEnterpriseModuleAccess({
      userId: context.userId,
      organizationId,
      moduleCode,
      action,
    });
    if (!moduleDecision.allowed) {
      return deny("MODULE_NOT_ALLOWED", moduleDecision.message);
    }
  }

  return { allowed: true, reasonCode: "ALLOWED", message: "Accès autorisé." };
}
