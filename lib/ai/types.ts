import type { OpenAIInputMessage } from "@/lib/openai";
import type { SaasPlanCode } from "@/lib/billing/plans";
import type { AiProviderEvent } from "@/lib/ai/provider-events";

export type AiContextCode = "PERSONAL" | "DTSC_INTERNAL" | "ORGANIZATION" | "PROJECT" | "MODULE" | "OBJECT";

export type AiTaskType =
  | "GENERAL_CHAT"
  | "REASONING"
  | "SUMMARIZATION"
  | "DOCUMENT_ANALYSIS"
  | "EXTRACTION"
  | "STRUCTURED_GENERATION"
  | "CODE"
  | "TRANSLATION"
  | "ENTERPRISE_SEARCH"
  | "TOOL_EXECUTION"
  | "VISION"
  | "AUDIO"
  | "EMBEDDING"
  | "RERANKING";

export type AiModelProfileCode = "FAST" | "BALANCED" | "REASONING" | "LONG_CONTEXT" | "TOOLS" | "VISION" | "PREMIUM";

export type AiDataClassification =
  | "PUBLIC"
  | "INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED"
  | "HEALTH_SENSITIVE"
  | "HR_SENSITIVE"
  | "FINANCIAL_SENSITIVE"
  | "LEGAL_SENSITIVE"
  | "SECRET";

export type AiRequiredCapabilities = Partial<{
  text: boolean;
  vision: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  tools: boolean;
  structuredOutput: boolean;
  embeddings: boolean;
  reasoning: boolean;
}>;

export type AiPolicyFlags = {
  allowSensitiveExternalModel?: boolean;
  requireStructuredOutput?: boolean;
  requireTools?: boolean;
};

export type AiRoutingConstraints = {
  maximumEstimatedInputCost?: number | null;
  preferLowerCost?: boolean;
  preferLowerLatency?: boolean;
  requireZeroDataRetention?: boolean;
  maximumProviderPromptPricePerMillion?: number | null;
  maximumProviderCompletionPricePerMillion?: number | null;
  providerSortPreference?: "price" | "latency" | "throughput" | null;
};

export type AiModelStatus = "ACTIVE" | "DEGRADED" | "DISABLED" | "RETIRED";

export type AiProviderDefinition = {
  code: string;
  labelKey: string;
  descriptionKey: string;
  protocol: "OPENAI_RESPONSES" | "OPENAI_CHAT_COMPLETIONS" | "OPENROUTER_CHAT_COMPLETIONS";
  baseUrl: string;
  apiKeyEnv: string;
  status: AiModelStatus;
  regions: string[];
  dataPolicyCode: string;
  supportsStreaming: boolean;
};

export type AiModelDefinition = {
  code: string;
  providerCode: string;
  providerModelId: string;
  labelKey: string;
  descriptionKey: string;
  status: AiModelStatus;
  profileCodes?: AiModelProfileCode[];
  certificationVersion?: string | null;
  certifiedAt?: string | null;
  capabilities: {
    text: boolean;
    vision: boolean;
    audioInput: boolean;
    audioOutput: boolean;
    tools: boolean;
    structuredOutput: boolean;
    embeddings: boolean;
    reasoning: boolean;
  };
  contextWindow?: number | null;
  maximumOutputTokens?: number | null;
  supportsStreaming: boolean;
  costProfile?: {
    inputPerMillion?: number | null;
    outputPerMillion?: number | null;
    cachedInputPerMillion?: number | null;
    currency?: string | null;
  };
  allowedContexts: AiContextCode[];
  allowedLocales?: string[];
  minimumPlan?: string | null;
  dataPolicyCode: string;
  fallbackModelCodes: string[];
  taskTypes?: AiTaskType[];
};

export type AiProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CONTEXT_TOO_LARGE"
  | "CONTENT_REJECTED"
  | "INVALID_REQUEST"
  | "AUTHENTICATION_FAILED"
  | "STRUCTURED_OUTPUT_INVALID"
  | "TOOL_CALL_INVALID"
  | "STREAM_INTERRUPTED"
  | "UNKNOWN_PROVIDER_ERROR";

export type AiRouteRequest = {
  requestedModel?: string | null;
  taskType: AiTaskType;
  context: AiContextCode;
  locale: string;
  messages: OpenAIInputMessage[];
  instructions: string;
  userId: string;
  organizationId?: string | null;
  planCode?: SaasPlanCode | null;
  dataClassifications?: AiDataClassification[];
  requiredCapabilities?: AiRequiredCapabilities;
  maximumContextTokens?: number | null;
  assistantCode?: string | null;
  policyFlags?: AiPolicyFlags;
  routingConstraints?: AiRoutingConstraints;
  tags?: string[];
  signal?: AbortSignal;
};

export type AiRouteSelection = {
  strategyCode: string;
  taskType: AiTaskType;
  requestedModel: string | null;
  selectedModel: AiModelDefinition;
  fallbackModelCodes: string[];
  selectionReason: string;
  selectionScore?: number | null;
  selectionCriteria?: {
    capabilityScore: number;
    preferenceScore: number;
    healthScore: number;
    costScore: number;
    latencyScore: number;
    healthStatus: string;
    reasonParts: string[];
  } | null;
  estimatedInputCost: number | null;
  currency: string | null;
};

export type AiStreamResult = {
  stream: ReadableStream<AiProviderEvent>;
  selection: AiRouteSelection;
  providerCode: string;
  modelCode: string;
  providerModelId: string;
  fallbackUsed: boolean;
  attempts: Array<{ providerCode: string; modelCode: string; outcome: "SUCCESS" | "FAILED"; reasonCode?: AiProviderErrorCode }>;
};
