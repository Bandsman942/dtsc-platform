import { getConfiguredOpenAIModels, getDefaultOpenAIModel, getDisplayName } from "@/lib/openai-config";
import { evaluateAiModelPolicy } from "@/lib/ai/policy";
import type {
  AiContextCode,
  AiDataClassification,
  AiModelDefinition,
  AiProviderDefinition,
  AiRequiredCapabilities,
  AiTaskType,
} from "@/lib/ai/types";
import type { SaasPlanCode } from "@/lib/billing/plans";

const ALL_CONTEXTS: AiContextCode[] = ["PERSONAL", "DTSC_INTERNAL", "ORGANIZATION", "PROJECT", "MODULE", "OBJECT"];
const TEXT_TASKS: AiTaskType[] = [
  "GENERAL_CHAT",
  "REASONING",
  "SUMMARIZATION",
  "DOCUMENT_ANALYSIS",
  "EXTRACTION",
  "STRUCTURED_GENERATION",
  "CODE",
  "TRANSLATION",
  "ENTERPRISE_SEARCH",
  "TOOL_EXECUTION",
];
const SUPPORTED_PROVIDER_PROTOCOLS = new Set<AiProviderDefinition["protocol"]>([
  "OPENAI_RESPONSES",
  "OPENAI_CHAT_COMPLETIONS",
  "OPENROUTER_CHAT_COMPLETIONS",
]);

function parseJsonArray<T>(raw: string | undefined): T[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const defaultProvider: AiProviderDefinition = {
  code: "OPENAI",
  labelKey: "ai.providers.openai.label",
  descriptionKey: "ai.providers.openai.description",
  protocol: "OPENAI_RESPONSES",
  baseUrl: "https://api.openai.com/v1",
  apiKeyEnv: "OPENAI_API_KEY",
  status: "ACTIVE",
  regions: [],
  dataPolicyCode: "OPENAI_STANDARD",
  supportsStreaming: true,
};

function defaultOpenAiModels(): AiModelDefinition[] {
  const configured = getConfiguredOpenAIModels();
  const fallback = configured.filter((model) => model !== getDefaultOpenAIModel());
  return configured.map((modelId, index) => ({
    code: modelId,
    providerCode: "OPENAI",
    providerModelId: modelId,
    labelKey: `ai.models.${modelId.replace(/[^a-zA-Z0-9]+/g, "_")}.label`,
    descriptionKey: "ai.models.generic.description",
    status: "ACTIVE",
    capabilities: {
      text: true,
      vision: false,
      audioInput: false,
      audioOutput: false,
      tools: true,
      structuredOutput: true,
      embeddings: false,
      reasoning: /reason|o\d|gpt-5/i.test(modelId),
    },
    supportsStreaming: true,
    costProfile: undefined,
    allowedContexts: ALL_CONTEXTS,
    allowedLocales: ["fr", "en"],
    minimumPlan: index === 0 ? null : "BUSINESS",
    dataPolicyCode: "OPENAI_STANDARD",
    fallbackModelCodes: index === 0 ? fallback : configured.filter((candidate) => candidate !== modelId).slice(0, 2),
    taskTypes: TEXT_TASKS,
  }));
}

function isProviderDefinition(value: unknown): value is AiProviderDefinition {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AiProviderDefinition>;
  return Boolean(
    record.code &&
      record.baseUrl &&
      record.apiKeyEnv &&
      record.protocol &&
      SUPPORTED_PROVIDER_PROTOCOLS.has(record.protocol),
  );
}

function isModelDefinition(value: unknown): value is AiModelDefinition {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AiModelDefinition>;
  return Boolean(record.code && record.providerCode && record.providerModelId && record.capabilities && Array.isArray(record.allowedContexts));
}

export function getAiProviderCatalog() {
  const configured = parseJsonArray<unknown>(process.env.AI_PROVIDER_CATALOG_JSON).filter(isProviderDefinition);
  const providers = [defaultProvider, ...configured.filter((provider) => provider.code !== defaultProvider.code)];
  return providers.filter((provider) => provider.status !== "RETIRED");
}

export function getAiModelCatalog() {
  const configured = parseJsonArray<unknown>(process.env.AI_MODEL_CATALOG_JSON).filter(isModelDefinition);
  const byCode = new Map<string, AiModelDefinition>();
  for (const model of [...defaultOpenAiModels(), ...configured]) byCode.set(model.code, model);
  return [...byCode.values()].filter((model) => model.status !== "RETIRED");
}

export function getAiProviderDefinition(providerCode: string) {
  return getAiProviderCatalog().find((provider) => provider.code === providerCode) || null;
}

export function getAiModelDefinition(modelCode?: string | null) {
  const catalog = getAiModelCatalog();
  if (!modelCode) return catalog.find((model) => model.code === getDefaultOpenAIModel()) || catalog[0] || null;
  return catalog.find((model) => model.code === modelCode || model.providerModelId === modelCode) || null;
}

type AiAvailabilityInput = {
  context: AiContextCode;
  locale: string;
  taskType?: AiTaskType;
  planCode?: SaasPlanCode | null;
  dataClassifications?: AiDataClassification[];
  requiredCapabilities?: AiRequiredCapabilities;
  maximumContextTokens?: number | null;
  allowSensitiveExternalModel?: boolean;
};

export function listAvailableAiModels(input: AiAvailabilityInput) {
  const providers = new Map(getAiProviderCatalog().map((provider) => [provider.code, provider]));
  return getAiModelCatalog().filter((model) => {
    const provider = providers.get(model.providerCode);
    if (!provider || provider.status === "DISABLED" || model.status === "DISABLED") return false;
    if (!process.env[provider.apiKeyEnv]) return false;

    const decision = evaluateAiModelPolicy({
      request: {
        context: input.context,
        locale: input.locale,
        taskType: input.taskType || "GENERAL_CHAT",
        planCode: input.planCode,
        dataClassifications: input.dataClassifications,
        requiredCapabilities: input.requiredCapabilities,
        maximumContextTokens: input.maximumContextTokens,
        policyFlags: { allowSensitiveExternalModel: input.allowSensitiveExternalModel },
      },
      model,
      provider,
    });
    return decision.allowed;
  });
}

export function listCatalogAiModelsForUi(input: AiAvailabilityInput) {
  return listAvailableAiModels(input).map((model) => ({
    id: model.code,
    label: model.providerCode === "OPENAI" ? getDisplayName(model.providerModelId) : model.providerModelId || model.code,
    providerCode: model.providerCode,
    status: model.status,
    minimumPlan: model.minimumPlan || null,
  }));
}

export function isCatalogAiModelAllowed({ modelCode, ...input }: AiAvailabilityInput & { modelCode: string }) {
  return listAvailableAiModels(input).some((model) => model.code === modelCode || model.providerModelId === modelCode);
}

export function assertAiCatalogIntegrity() {
  const failures: string[] = [];
  const providerCodes = new Set<string>();
  const modelCodes = new Set<string>();
  for (const provider of getAiProviderCatalog()) {
    if (providerCodes.has(provider.code)) failures.push(`Duplicate AI provider code: ${provider.code}`);
    providerCodes.add(provider.code);
  }
  for (const model of getAiModelCatalog()) {
    if (modelCodes.has(model.code)) failures.push(`Duplicate AI model code: ${model.code}`);
    modelCodes.add(model.code);
    if (!providerCodes.has(model.providerCode)) failures.push(`${model.code}: unknown provider ${model.providerCode}`);
    for (const fallback of model.fallbackModelCodes) {
      if (fallback === model.code) failures.push(`${model.code}: self fallback is forbidden`);
    }
  }
  return failures;
}
