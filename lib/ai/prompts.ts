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
  { code: "LANGUAGE", version: "2026-08-11.1", effectiveAt: "2026-08-11", description: "Response locale and user-facing presentation contract" },
];

export function getAiPromptVersion(code: AiPromptCode) {
  return AI_PROMPT_REGISTRY.find((entry) => entry.code === code) || null;
}

function buildUserFacingPresentationInstruction(locale: string) {
  return locale === "en"
    ? [
        "Present DTSC Platform exactly as a business user sees it in the interface.",
        "Never expose internal module codes, enum values, database field names, camelCase keys, environment variables, raw tool names, provider identifiers, MCP payloads, technical route names or implementation flags unless the user explicitly asks for technical debugging details.",
        "Translate internal facts into the visible business label and an understandable effect. For example, say 'Expired batches cannot be sold' instead of displaying an internal boolean setting.",
        "When listing accessible features, use the translated navigation/module labels visible in DTSC Platform rather than identifiers such as AI_ASSISTANT or PHARMACY_SETTINGS.",
        "If a source contains technical names, use them only to reason internally; answer with human wording while preserving the source meaning.",
        "Do not reveal secrets, tokens, hidden configuration, raw connector payloads, database structure or protected logs.",
      ].join("\n")
    : [
        "Présente DTSC Platform exactement comme un utilisateur métier la voit dans l’interface.",
        "N’expose jamais les codes internes de modules, valeurs d’enums, noms de champs de base de données, clés camelCase, variables d’environnement, noms bruts d’outils, identifiants de fournisseurs, payloads MCP, routes techniques ou flags d’implémentation, sauf si l’utilisateur demande explicitement un diagnostic technique.",
        "Transforme les faits internes en libellé métier visible et en effet compréhensible. Par exemple, dis « Les lots expirés ne peuvent pas être vendus » au lieu d’afficher un booléen ou son nom technique.",
        "Pour lister les fonctionnalités accessibles, utilise les libellés traduits de navigation et de modules visibles dans DTSC Platform, jamais des identifiants comme AI_ASSISTANT ou PHARMACY_SETTINGS.",
        "Si une source contient des noms techniques, utilise-les seulement pour raisonner en interne ; réponds avec un langage humain sans changer le sens de la source.",
        "Ne révèle jamais de secrets, tokens, configuration cachée, payloads bruts de connecteurs, structure de base de données ou logs protégés.",
      ].join("\n");
}

export function buildLanguageInstruction(locale: string, explicitlyRequestedLanguage?: string | null) {
  const presentationInstruction = buildUserFacingPresentationInstruction(locale);
  if (explicitlyRequestedLanguage) {
    return [
      `Réponds dans la langue explicitement demandée : ${explicitlyRequestedLanguage}.`,
      "Ne traduis pas silencieusement les messages, titres, documents, commentaires ou données métier fournis par l'utilisateur.",
      "Les citations restent dans leur langue source sauf demande explicite de traduction.",
      presentationInstruction,
    ].join("\n");
  }
  return locale === "en"
    ? [
        "Respond in English by default, unless the user explicitly requests another language in the current message.",
        "Do not silently translate user messages, titles, documents, comments or business data.",
        "Keep citations in their source language unless the user explicitly asks for a translation.",
        presentationInstruction,
      ].join("\n")
    : [
        "Réponds en français par défaut, sauf si l'utilisateur demande explicitement une autre langue dans son message actuel.",
        "Ne traduis pas silencieusement les messages, titres, documents, commentaires ou données métier fournis par l'utilisateur.",
        "Les citations restent dans leur langue source sauf demande explicite de traduction.",
        presentationInstruction,
      ].join("\n");
}
