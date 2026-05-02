import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { DEFAULT_MODEL } from "@/lib/constants";
import {
  getDefaultOpenAIModel,
  hasOpenAIKey,
  isConfiguredOpenAIModel,
  openai,
} from "@/lib/openai-config";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    modelId,
  }: { messages: UIMessage[]; modelId?: string } = await req.json();
  const requestedModelId = modelId || getDefaultOpenAIModel();
  const selectedModelId = isConfiguredOpenAIModel(requestedModelId)
    ? requestedModelId
    : requestedModelId === DEFAULT_MODEL
      ? getDefaultOpenAIModel()
      : null;

  if (!hasOpenAIKey()) {
    return new Response(
      JSON.stringify({
        error:
          "Missing OPENAI_API_KEY. Add it to .env.local before using OpenAI models.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!selectedModelId) {
    return new Response(
      JSON.stringify({ error: `Model ${requestedModelId} is not supported` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = streamText({
    model: openai(selectedModelId),
    system: "You are a software engineer exploring Generative AI.",
    messages: convertToModelMessages(messages),
    onError: (e) => {
      console.error("Error while streaming.", e);
    },
  });

  return result.toUIMessageStreamResponse();
}
