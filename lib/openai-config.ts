import { DEFAULT_MODEL, DEFAULT_OPENAI_MODELS } from "@/lib/constants";

function parseModelIds(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((modelId) => modelId.trim())
      .filter(Boolean) ?? []
  );
}

export function getConfiguredOpenAIModels() {
  const configuredModels = parseModelIds(process.env.OPENAI_MODEL_IDS);
  const models = configuredModels.length
    ? configuredModels
    : DEFAULT_OPENAI_MODELS;

  return Array.from(new Set(models));
}

export function getDefaultOpenAIModel() {
  const models = getConfiguredOpenAIModels();
  return models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0];
}

export function isConfiguredOpenAIModel(modelId: string) {
  return getConfiguredOpenAIModels().includes(modelId);
}

export function getDisplayName(modelId: string) {
  return modelId
    .replace(/^ft:/, "fine-tuned: ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}
