import type { AiProviderErrorCode } from "@/lib/ai/types";

export class AiProviderError extends Error {
  readonly reasonCode: AiProviderErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly providerCode?: string;
  readonly modelCode?: string;

  constructor({
    reasonCode,
    message,
    statusCode = 502,
    retryable = false,
    providerCode,
    modelCode,
  }: {
    reasonCode: AiProviderErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    providerCode?: string;
    modelCode?: string;
  }) {
    super(message);
    this.name = "AiProviderError";
    this.reasonCode = reasonCode;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.providerCode = providerCode;
    this.modelCode = modelCode;
  }
}

export function classifyProviderHttpError(status: number): Pick<AiProviderError, "reasonCode" | "retryable" | "statusCode"> {
  if (status === 401 || status === 403) return { reasonCode: "AUTHENTICATION_FAILED", retryable: false, statusCode: 502 };
  if (status === 408 || status === 504) return { reasonCode: "TIMEOUT", retryable: true, statusCode: 504 };
  if (status === 413) return { reasonCode: "CONTEXT_TOO_LARGE", retryable: false, statusCode: 413 };
  if (status === 429) return { reasonCode: "RATE_LIMITED", retryable: true, statusCode: 429 };
  if (status === 400 || status === 422) return { reasonCode: "INVALID_REQUEST", retryable: false, statusCode: 400 };
  if (status === 404) return { reasonCode: "MODEL_UNAVAILABLE", retryable: true, statusCode: 502 };
  if (status >= 500) return { reasonCode: "PROVIDER_UNAVAILABLE", retryable: true, statusCode: 502 };
  return { reasonCode: "UNKNOWN_PROVIDER_ERROR", retryable: false, statusCode: 502 };
}

export function toAiReasonCode(error: unknown): AiProviderErrorCode {
  return error instanceof AiProviderError ? error.reasonCode : "UNKNOWN_PROVIDER_ERROR";
}
