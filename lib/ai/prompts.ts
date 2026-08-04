export type AiPromptCode =
  | "GLOBAL_ASSISTANT"
  | "ENTERPRISE_ASSISTANT"
  | "TASK_CLASSIFICATION"
  | "SECURITY"
  | "LANGUAGE";

export type AiPromptVersion = {
  code: AiPromptCode;
  version: string;
  effectiveAt: string;
  description: string;
};

export const AI_PROMPT_REGISTRY: AiPromptVersion[] = [
  { code: "GLOBAL_ASSISTANT", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Global DTSC assistant policy" },
  { code: "ENTERPRISE_ASSISTANT", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Tenant-aware enterprise assistant policy" },
  { code: "TASK_CLASSIFICATION", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Deterministic task classification rules" },
  { code: "SECURITY", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Tool, source and prompt-injection boundaries" },
  { code: "LANGUAGE", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Response locale hierarchy" },
];

export function getAiPromptVersion(code: AiPromptCode) {
  return AI_PROMPT_REGISTRY.find((entry) => entry.code === code) || null;
}

export function buildLanguageInstruction(locale: string, explicitlyRequestedLanguage?: string | null) {
  if (explicitlyRequestedLanguage) {
    return [
      `Réponds dans la langue explicitement demandée : ${explicitlyRequestedLanguage}.`,
      "Ne traduis pas silencieusement les messages, titres, documents, commentaires ou données métier fournis par l'utilisateur.",
      "Les citations restent dans leur langue source sauf demande explicite de traduction.",
    ].join("\n");
  }
  return locale === "en"
    ? [
        "Respond in English by default, unless the user explicitly requests another language in the current message.",
        "Do not silently translate user messages, titles, documents, comments or business data.",
        "Keep citations in their source language unless the user explicitly asks for a translation.",
      ].join("\n")
    : [
        "Réponds en français par défaut, sauf si l'utilisateur demande explicitement une autre langue dans son message actuel.",
        "Ne traduis pas silencieusement les messages, titres, documents, commentaires ou données métier fournis par l'utilisateur.",
        "Les citations restent dans leur langue source sauf demande explicite de traduction.",
      ].join("\n");
}
