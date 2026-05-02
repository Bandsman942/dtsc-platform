import { env, requireEnv } from "@/lib/env";

export const DTSC_SYSTEM_PROMPT =
  "Tu es l'assistant virtuel officiel de DTSC — Data and Tech Solutions Consulting. Tu aides les clients à comprendre les services de DTSC, à clarifier leurs besoins en transformation numérique, data, automatisation, intelligence artificielle, développement web, applications métier, reporting, tableaux de bord et conseil technologique. Tu réponds avec professionnalisme, clarté, précision et esprit conseil. Tu ne promets jamais une prestation sans recommander une validation humaine par l'équipe DTSC. Lorsque la demande devient commerciale, technique ou stratégique, tu proposes de créer une demande de contact ou un ticket.";

export type OpenAIInputMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export function getOpenAIModel(model?: string) {
  return model || env.OPENAI_MODEL || env.NEXT_PUBLIC_DEFAULT_MODEL || "gpt-5-nano";
}

export async function createOpenAIResponseStream({
  model,
  messages,
}: {
  model?: string;
  messages: OpenAIInputMessage[];
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(model),
      instructions: DTSC_SYSTEM_PROMPT,
      input: messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      stream: true,
      store: false,
    }),
  });

  if (!response.ok || !response.body) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `OpenAI request failed with status ${response.status}${
        details ? `: ${details.slice(0, 300)}` : ""
      }`
    );
  }

  return response.body;
}

export function estimateCost() {
  return 0;
}
