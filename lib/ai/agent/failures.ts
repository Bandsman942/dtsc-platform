import { AiProviderError } from "@/lib/ai/errors";
import type { AiProviderErrorCode } from "@/lib/ai/types";

export type AiAgentClientFailureCategory =
  | "SERVICE_TEMPORARILY_UNAVAILABLE"
  | "LIMIT_REACHED"
  | "ACTION_REFUSED"
  | "REQUEST_INVALID"
  | "CANCELLED"
  | "UNAVAILABLE";

const RETRYABLE_PROVIDER_REASONS = new Set<AiProviderErrorCode>([
  "PROVIDER_UNAVAILABLE",
  "MODEL_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
  "STREAM_INTERRUPTED",
]);

export function isRetryableAgentModelError(error: unknown) {
  return error instanceof AiProviderError && (error.retryable || RETRYABLE_PROVIDER_REASONS.has(error.reasonCode));
}

export function getAiAgentInternalReasonCode(error: unknown) {
  if (error instanceof AiProviderError) return error.reasonCode;
  if (error instanceof Error && error.message) return error.message.slice(0, 160);
  return "AGENT_RUNTIME_FAILED";
}

export function getAiAgentInternalDiagnostic(error: unknown) {
  if (error instanceof AiProviderError) {
    return {
      reasonCode: error.reasonCode,
      statusCode: error.statusCode,
      providerCode: error.providerCode || null,
      modelCode: error.modelCode || null,
      fingerprint: error.message.slice(0, 160),
    };
  }
  if (error instanceof Error) {
    return {
      reasonCode: "AGENT_RUNTIME_FAILED",
      statusCode: null,
      providerCode: null,
      modelCode: null,
      fingerprint: error.name.slice(0, 80),
    };
  }
  return {
    reasonCode: "AGENT_RUNTIME_FAILED",
    statusCode: null,
    providerCode: null,
    modelCode: null,
    fingerprint: "unknown",
  };
}

export function classifyAiAgentFailure(reasonCode?: string | null, status?: string | null): AiAgentClientFailureCategory | null {
  if (status === "CANCELLED" || reasonCode?.includes("CANCELLED")) return "CANCELLED";
  if (status === "BUDGET_EXHAUSTED" || reasonCode?.startsWith("MAX_") || reasonCode?.includes("LIMIT_REACHED") || reasonCode === "RATE_LIMITED") return "LIMIT_REACHED";
  if (reasonCode === "FORBIDDEN" || reasonCode === "UNAUTHORIZED" || reasonCode?.includes("NOT_ALLOWED") || reasonCode?.includes("DENIED") || reasonCode?.includes("NOT_READY")) return "ACTION_REFUSED";
  if (reasonCode === "INVALID_REQUEST" || reasonCode === "CONTEXT_TOO_LARGE" || (reasonCode?.includes("INVALID") && !["PROVIDER_PROTOCOL_INVALID", "TOOL_CALL_INVALID"].includes(reasonCode))) return "REQUEST_INVALID";
  if (reasonCode && ["PROVIDER_UNAVAILABLE", "MODEL_UNAVAILABLE", "TIMEOUT", "STREAM_INTERRUPTED", "UNKNOWN_PROVIDER_ERROR", "AGENT_RUNTIME_FAILED", "PROVIDER_PROTOCOL_INVALID", "TOOL_CALL_INVALID"].includes(reasonCode)) return "SERVICE_TEMPORARILY_UNAVAILABLE";
  if (status === "FAILED" || reasonCode) return "UNAVAILABLE";
  return null;
}

export function getAiAgentClientFailureMessage(category: AiAgentClientFailureCategory | null | undefined, locale: string) {
  const en = locale === "en";
  switch (category) {
    case "SERVICE_TEMPORARILY_UNAVAILABLE":
      return en ? "The AI service was temporarily unavailable. You can retry this analysis." : "Le service IA a été temporairement indisponible. Vous pouvez relancer cette analyse.";
    case "LIMIT_REACHED":
      return en ? "The agent stopped because an execution or usage limit was reached." : "L’agent s’est arrêté car une limite d’exécution ou d’utilisation a été atteinte.";
    case "ACTION_REFUSED":
      return en ? "This action could not be performed with the current access or state." : "Cette action n’a pas pu être exécutée avec les accès ou l’état actuels.";
    case "REQUEST_INVALID":
      return en ? "The agent could not continue with the current request. Please adjust it and retry." : "L’agent n’a pas pu continuer avec cette demande. Ajustez-la puis réessayez.";
    case "CANCELLED":
      return en ? "The agent run was cancelled." : "L’exécution de l’agent a été annulée.";
    default:
      return en ? "The agent could not complete this run." : "L’agent n’a pas pu terminer cette exécution.";
  }
}

export function buildAiAgentClientFailurePayload(input: {
  reasonCode?: string | null;
  status?: string | null;
  locale: string;
  error?: string;
}) {
  const failureCategory = classifyAiAgentFailure(input.reasonCode, input.status) || "UNAVAILABLE";
  return {
    error: input.error || "AGENT_UNAVAILABLE",
    failureCategory,
    message: getAiAgentClientFailureMessage(failureCategory, input.locale),
  };
}
