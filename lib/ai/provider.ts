import { AiProviderError, classifyProviderHttpError } from "@/lib/ai/errors";
import type { AiModelDefinition, AiProviderDefinition } from "@/lib/ai/types";
import type { OpenAIInputMessage } from "@/lib/openai";

export async function createProviderResponseStream({
  provider,
  model,
  messages,
  instructions,
  signal,
}: {
  provider: AiProviderDefinition;
  model: AiModelDefinition;
  messages: OpenAIInputMessage[];
  instructions: string;
  signal?: AbortSignal;
}) {
  if (provider.protocol !== "OPENAI_RESPONSES") {
    throw new AiProviderError({ reasonCode: "INVALID_REQUEST", message: `Unsupported AI provider protocol: ${provider.protocol}`, providerCode: provider.code, modelCode: model.code });
  }
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new AiProviderError({
      reasonCode: "AUTHENTICATION_FAILED",
      message: `Missing credential for ${provider.code}`,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }

  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.providerModelId,
        instructions,
        input: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: message.role, content: message.content })),
        stream: true,
        store: false,
      }),
      signal,
    });
  } catch (error) {
    const interrupted = error instanceof DOMException && error.name === "AbortError";
    throw new AiProviderError({
      reasonCode: interrupted ? "STREAM_INTERRUPTED" : "PROVIDER_UNAVAILABLE",
      message: interrupted ? "AI provider request interrupted" : "AI provider request failed",
      retryable: !interrupted,
      statusCode: interrupted ? 499 : 502,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }

  if (!response.ok || !response.body) {
    const classified = classifyProviderHttpError(response.status);
    const details = await response.text().catch(() => "");
    throw new AiProviderError({
      ...classified,
      message: `${provider.code} response ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`,
      providerCode: provider.code,
      modelCode: model.code,
    });
  }
  return response.body;
}
