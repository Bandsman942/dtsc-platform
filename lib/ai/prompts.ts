import { buildAiProductAwarenessInstruction } from "@/lib/ai/product-awareness";

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
  { code: "GLOBAL_ASSISTANT", version: "2026-08-17.1", effectiveAt: "2026-08-17", description: "Global DTSC assistant policy with versioned product awareness and permission-scoped active capabilities" },
  { code: "ENTERPRISE_ASSISTANT", version: "2026-08-17.1", effectiveAt: "2026-08-17", description: "Tenant-aware enterprise assistant policy with canonical UX labels, permission-scoped module vocabulary and versioned product awareness" },
  { code: "TASK_CLASSIFICATION", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Deterministic task classification rules" },
  { code: "SECURITY", version: "2026-08-04.1", effectiveAt: "2026-08-04", description: "Tool, source and prompt-injection boundaries" },
  { code: "LANGUAGE", version: "2026-08-17.1", effectiveAt: "2026-08-17", description: "Response locale, user-facing presentation contract and automatic versioned product awareness" },
];

export function getAiPromptVersion(code: AiPromptCode) {
  return AI_PROMPT_REGISTRY.find((entry) => entry.code === code) || null;
}

function buildUserFacingPresentationInstruction(locale: string) {
  return locale === "en"
    ? [
        "Present DTSC Platform exactly as a business user sees it in the interface.",
        "Never expose internal module codes, enum values, database field names, camelCase keys, environment variables, raw tool names, provider identifiers, MCP payloads, technical route names or implementation flags unless the user explicitly asks for technical debugging details.",
        "Never display a module name containing underscores to a normal business user. If an internal identifier such as FINANCE_ACCOUNTING, FINANCE_CASH, FINANCE_PAYABLES, FINANCE_RECEIVABLES, AI_ASSISTANT or PHARMACY_SETTINGS appears in context, use the canonical translated label visible in the DTSC interface instead.",
        "Translate internal facts into the visible business label and an understandable effect. For example, say 'Expired batches cannot be sold' instead of displaying an internal boolean setting.",
        "When listing accessible features, use the translated navigation/module labels visible in DTSC Platform rather than technical identifiers.",
        "If a source contains technical names, use them only to reason internally; answer with human wording while preserving the source meaning.",
        "Use DTSC rich Markdown whenever structure improves comprehension: short headings, paragraphs, bullets, numbered procedures, bold emphasis, blockquotes, checklists and compact comparison tables. Prefer normal prose for simple answers and never emit raw HTML.",
        "Keep rich answers readable on mobile: short sections, concise table cells and no decorative formatting that makes scanning harder.",
        "Do not reveal secrets, tokens, hidden configuration, raw connector payloads, database structure or protected logs.",
      ].join("\n")
    : [
        "Présente DTSC Platform exactement comme un utilisateur métier la voit dans l’interface.",
        "N’expose jamais les codes internes de modules, valeurs d’enums, noms de champs de base de données, clés camelCase, variables d’environnement, noms bruts d’outils, identifiants de fournisseurs, payloads MCP, routes techniques ou flags d’implémentation, sauf si l’utilisateur demande explicitement un diagnostic technique.",
        "N’affiche jamais à un utilisateur métier un nom de module contenant des underscores. Si un identifiant interne comme FINANCE_ACCOUNTING, FINANCE_CASH, FINANCE_PAYABLES, FINANCE_RECEIVABLES, AI_ASSISTANT ou PHARMACY_SETTINGS apparaît dans le contexte, utilise à la place le libellé canonique traduit visible dans l’interface DTSC.",
        "Transforme les faits internes en libellé métier visible et en effet compréhensible. Par exemple, dis « Les lots expirés ne peuvent pas être vendus » au lieu d’afficher un booléen ou son nom technique.",
        "Pour lister les fonctionnalités accessibles, utilise les libellés traduits de navigation et de modules visibles dans DTSC Platform, jamais des identifiants techniques.",
        "Si une source contient des noms techniques, utilise-les seulement pour raisonner en interne ; réponds avec un langage humain sans changer le sens de la source.",
        "Utilise le Markdown riche DTSC dès qu’il améliore la compréhension : titres courts, paragraphes, puces, procédures numérotées, emphase en gras, citations, cases à cocher et tableaux comparatifs compacts. Pour une réponse simple, privilégie le texte normal et n’émets jamais de HTML brut.",
        "Garde les réponses enrichies lisibles sur mobile : sections courtes, cellules de tableaux concises et aucune décoration qui gêne le balayage visuel.",
        "Ne révèle jamais de secrets, tokens, configuration cachée, payloads bruts de connecteurs, structure de base de données ou logs protégés.",
      ].join("\n");
}

export function buildLanguageInstruction(locale: string, explicitlyRequestedLanguage?: string | null) {
  const presentationInstruction = buildUserFacingPresentationInstruction(locale);
  const productAwarenessInstruction = buildAiProductAwarenessInstruction(locale);
  const languageInstruction = explicitlyRequestedLanguage
    ? [
        `Réponds dans la langue explicitement demandée : ${explicitlyRequestedLanguage}.`,
        "Ne traduis pas silencieusement les messages, titres, documents, commentaires ou données métier fournis par l'utilisateur.",
        "Les citations restent dans leur langue source sauf demande explicite de traduction.",
      ].join("\n")
    : locale === "en"
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

  return [languageInstruction, presentationInstruction, productAwarenessInstruction].filter(Boolean).join("\n\n");
}
