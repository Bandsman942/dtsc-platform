import { env, requireEnv } from "@/lib/env";

export type EmbeddingProviderDefinition = {
  providerCode: string;
  modelCode: string;
  dimension: number;
  maximumInputCharacters: number;
  supportsBatch: boolean;
  maximumBatchSize: number;
  version: string;
};

export type EmbeddingBatchResult = {
  definition: EmbeddingProviderDefinition;
  embeddings: number[][];
};

const OPENAI_EMBEDDING_DEFINITION: EmbeddingProviderDefinition = {
  providerCode: "OPENAI",
  modelCode: env.OPENAI_EMBEDDING_MODEL,
  dimension: 1536,
  maximumInputCharacters: 120_000,
  supportsBatch: true,
  maximumBatchSize: 64,
  version: "openai-1536-v1",
};

function validateEmbedding(values: unknown, definition: EmbeddingProviderDefinition) {
  if (!Array.isArray(values)) throw new Error("EMBEDDING_RESPONSE_INVALID");
  const normalized = values.map((value) => Number(value));
  if (normalized.some((value) => !Number.isFinite(value))) throw new Error("EMBEDDING_RESPONSE_INVALID");
  if (normalized.length !== definition.dimension) throw new Error("EMBEDDING_DIMENSION_MISMATCH");
  return normalized;
}

async function createOpenAiEmbeddings(inputs: string[]): Promise<EmbeddingBatchResult> {
  const definition = OPENAI_EMBEDDING_DEFINITION;
  if (!inputs.length) return { definition, embeddings: [] };
  if (inputs.length > definition.maximumBatchSize) throw new Error("EMBEDDING_BATCH_TOO_LARGE");
  if (inputs.some((input) => input.length > definition.maximumInputCharacters)) throw new Error("EMBEDDING_INPUT_TOO_LARGE");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: definition.modelCode, input: inputs }),
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) throw new Error(`EMBEDDING_PROVIDER_FAILED:${response.status}`);
  const rows = Array.isArray(payload?.data)
    ? [...payload.data].sort((left, right) => Number(left?.index ?? 0) - Number(right?.index ?? 0))
    : [];
  if (rows.length !== inputs.length) throw new Error("EMBEDDING_RESPONSE_COUNT_MISMATCH");
  return { definition, embeddings: rows.map((row) => validateEmbedding(row?.embedding, definition)) };
}

export function getDefaultEmbeddingProvider() {
  return { ...OPENAI_EMBEDDING_DEFINITION };
}

export async function createEmbeddings(inputs: string[]) {
  return createOpenAiEmbeddings(inputs);
}

export async function createEmbedding(input: string) {
  const result = await createEmbeddings([input]);
  const embedding = result.embeddings[0];
  if (!embedding) throw new Error("EMBEDDING_RESPONSE_COUNT_MISMATCH");
  return { definition: result.definition, embedding };
}

export function getEmbeddingIndexVersion(definition: EmbeddingProviderDefinition = OPENAI_EMBEDDING_DEFINITION) {
  return `${definition.providerCode.toLowerCase()}:${definition.modelCode}:${definition.dimension}:${definition.version}`;
}
