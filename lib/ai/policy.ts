import { normalizePlanRequirement, planMeetsRequirement, type SaasPlanCode } from "@/lib/billing/plans";
import type {
  AiDataClassification,
  AiModelDefinition,
  AiProviderDefinition,
  AiRequiredCapabilities,
  AiRouteRequest,
} from "@/lib/ai/types";

export type AiPolicyReasonCode =
  | "ALLOWED"
  | "CONTEXT_NOT_ALLOWED"
  | "LOCALE_NOT_ALLOWED"
  | "TASK_NOT_ALLOWED"
  | "PLAN_NOT_ALLOWED"
  | "CAPABILITY_NOT_SUPPORTED"
  | "CONTEXT_TOO_LARGE"
  | "SECRET_NEVER_EXTERNAL"
  | "SENSITIVE_EXTERNAL_NOT_ALLOWED"
  | "PROVIDER_POLICY_MISMATCH";

export type AiPolicyDecision = {
  allowed: boolean;
  reasonCode: AiPolicyReasonCode;
};

const SENSITIVE_CLASSIFICATIONS = new Set<AiDataClassification>([
  "RESTRICTED",
  "HEALTH_SENSITIVE",
  "HR_SENSITIVE",
  "FINANCIAL_SENSITIVE",
  "LEGAL_SENSITIVE",
]);

// Fail closed: every provider is external until DTSC explicitly certifies a
// local runtime here. A newly configured provider code must never inherit local
// trust simply because the Policy Engine does not recognize its name yet.
const TRUSTED_LOCAL_PROVIDER_CODES = new Set<string>([]);

function supportsCapabilities(model: AiModelDefinition, required?: AiRequiredCapabilities) {
  if (!required) return true;
  return Object.entries(required).every(([key, requiredValue]) => {
    if (!requiredValue) return true;
    return Boolean(model.capabilities[key as keyof AiModelDefinition["capabilities"]]);
  });
}

function planAllowed(model: AiModelDefinition, planCode?: SaasPlanCode | null) {
  const required = normalizePlanRequirement(model.minimumPlan);
  if (!required) return true;
  if (!planCode) return false;
  return planMeetsRequirement(planCode, required);
}

function dataAllowed({
  request,
  model,
  provider,
}: {
  request: Pick<AiRouteRequest, "dataClassifications" | "policyFlags">;
  model: AiModelDefinition;
  provider: AiProviderDefinition;
}): AiPolicyDecision {
  const classifications = request.dataClassifications || ["INTERNAL"];
  const isExternal = !TRUSTED_LOCAL_PROVIDER_CODES.has(provider.code);

  if (classifications.includes("SECRET") && isExternal) {
    return { allowed: false, reasonCode: "SECRET_NEVER_EXTERNAL" };
  }

  if (classifications.some((classification) => SENSITIVE_CLASSIFICATIONS.has(classification)) && isExternal) {
    const explicitlyAllowed = request.policyFlags?.allowSensitiveExternalModel === true;
    if (!explicitlyAllowed) return { allowed: false, reasonCode: "SENSITIVE_EXTERNAL_NOT_ALLOWED" };
  }

  if (model.dataPolicyCode !== provider.dataPolicyCode && model.dataPolicyCode !== "INHERIT_PROVIDER") {
    return { allowed: false, reasonCode: "PROVIDER_POLICY_MISMATCH" };
  }

  return { allowed: true, reasonCode: "ALLOWED" };
}

export function evaluateAiModelPolicy({
  request,
  model,
  provider,
}: {
  request: Pick<
    AiRouteRequest,
    | "context"
    | "locale"
    | "taskType"
    | "planCode"
    | "dataClassifications"
    | "requiredCapabilities"
    | "maximumContextTokens"
    | "policyFlags"
  >;
  model: AiModelDefinition;
  provider: AiProviderDefinition;
}): AiPolicyDecision {
  if (!model.allowedContexts.includes(request.context)) return { allowed: false, reasonCode: "CONTEXT_NOT_ALLOWED" };
  if (model.allowedLocales?.length && !model.allowedLocales.includes(request.locale)) return { allowed: false, reasonCode: "LOCALE_NOT_ALLOWED" };
  if (model.taskTypes?.length && !model.taskTypes.includes(request.taskType)) return { allowed: false, reasonCode: "TASK_NOT_ALLOWED" };
  if (!planAllowed(model, request.planCode)) return { allowed: false, reasonCode: "PLAN_NOT_ALLOWED" };
  if (!supportsCapabilities(model, request.requiredCapabilities)) return { allowed: false, reasonCode: "CAPABILITY_NOT_SUPPORTED" };
  if (request.maximumContextTokens && model.contextWindow && request.maximumContextTokens > model.contextWindow) {
    return { allowed: false, reasonCode: "CONTEXT_TOO_LARGE" };
  }
  return dataAllowed({ request, model, provider });
}
