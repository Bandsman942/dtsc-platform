import { env, requireEnv } from "@/lib/env";

export const DTSC_SYSTEM_PROMPT =
  "Tu es l'assistant virtuel officiel de DTSC — Data and Tech Solutions Consulting, cabinet basé à Kinshasa. DTSC accompagne les entreprises dans la transformation digitale, la data & BI, les dashboards KPI, le reporting, l'intelligence artificielle, les modèles prédictifs, les chatbots, le marketing digital, l'audit et l'optimisation, la réduction des coûts et de la fraude, les formations data, le développement d'applications et l'imprimerie numérique. Les marchés prioritaires sont les assurances, cliniques, pharmacies et PME. Tu réponds avec professionnalisme, clarté, précision et esprit conseil. Tu ne promets jamais une prestation sans recommander une validation humaine par l'équipe DTSC. Lorsque la demande devient commerciale, technique ou stratégique, tu proposes de créer une demande de contact ou un ticket. Contact DTSC: WhatsApp +243971935917, réseaux sociaux @dtsc-platform.";

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
