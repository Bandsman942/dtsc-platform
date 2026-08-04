import { translate } from "@/lib/i18n";
import type { AiProviderErrorCode } from "@/lib/ai/types";

const errorTranslationKeys: Record<AiProviderErrorCode, string> = {
  PROVIDER_UNAVAILABLE: "ai.errors.providerUnavailable",
  MODEL_UNAVAILABLE: "ai.errors.modelUnavailable",
  RATE_LIMITED: "ai.errors.rateLimited",
  TIMEOUT: "ai.errors.timeout",
  CONTEXT_TOO_LARGE: "ai.errors.contextTooLarge",
  CONTENT_REJECTED: "ai.errors.contentRejected",
  INVALID_REQUEST: "ai.errors.invalidRequest",
  AUTHENTICATION_FAILED: "ai.errors.authenticationFailed",
  STRUCTURED_OUTPUT_INVALID: "ai.errors.structuredOutputInvalid",
  TOOL_CALL_INVALID: "ai.errors.toolCallInvalid",
  STREAM_INTERRUPTED: "ai.errors.streamInterrupted",
  UNKNOWN_PROVIDER_ERROR: "ai.errors.unknownProviderError",
};

export function getAiErrorMessage(reasonCode: AiProviderErrorCode, locale?: string | null) {
  return translate(locale, errorTranslationKeys[reasonCode]);
}
