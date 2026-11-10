/**
 * Narrow, explicit intentions for the standard text chat.
 * The standard /api/chat/v2 stream does not offer tool calls to the model.
 * Only unambiguous public time and web/news requests enter the audited
 * read-only Tool Gateway. General messages keep the existing LLM workflow.
 *
 * All tool arguments are generated on the server, not accepted as arbitrary
 * provider output. These patterns deliberately avoid broad keyword matching.
 */
export type PublicChatMcpIntent = {
  toolCode: "MCP_TIME_GET_CURRENT_TIME" | "MCP_BRAVE_SEARCH_WEB" | "MCP_BRAVE_SEARCH_NEWS";
  args: Record<string, unknown>;
};

const zones: Array<{ pattern: RegExp; zone: string }> = [
  { pattern: /\bKinshasa\b/i, zone: "Africa/Kinshasa" },
  { pattern: /\bLubumbashi\b/i, zone: "Africa/Lubumbashi" },
  { pattern: /\bParis\b/i, zone: "Europe/Paris" },
  { pattern: /\b(?:Londres|London)\b/i, zone: "Europe/London" },
  { pattern: /\bTokyo\b/i, zone: "Asia/Tokyo" },
  { pattern: /\bNew\s+York\b/i, zone: "America/New_York" },
  { pattern: /\bUTC\b/i, zone: "UTC" },
];

const sensitiveQueryPattern = /(?:[\w.%+-]+@[\w.-]+\.[a-z]{2,}|\b(?:mot de passe|password|num[eé]ro de carte|mon compte bancaire|dossier patient|identifiant personnel)\b|\bsk-[a-z\d_-]{18,}\b)/i;

export function detectPublicChatMcpIntent(content: string): PublicChatMcpIntent | null {
  const text = content.trim().slice(0, 1000);
  if (!text || sensitiveQueryPattern.test(text)) return null;

  const implicitNow = /(?:quelle?\s+heure\s+est[-\s]?il|what\s+time\s+is\s+it|il\s+est\s+quelle?\s+heure)/i.test(text);
  const asksCurrentTime = implicitNow || (
    /\b(?:heure|time)\b/i.test(text) && /\b(?:actuell(?:e|ement)?|maintenant|en ce moment|right now|current|now)\b/i.test(text)
  ) || (
    /\b(?:date|day)\b/i.test(text) &&
    /\b(?:aujourd['’]hui|today|maintenant|en ce moment|current)\b/i.test(text) &&
    /\b(?:quelle?|what|donne|dis-moi|tell|show|indiquer|indique)\b/i.test(text)
  );

  if (asksCurrentTime && text.length <= 260) {
    const specified = zones.find((entry) => entry.pattern.test(text));
    // Do not silently answer Kinshasa if another unknown city was requested.
    const hasUnknownLocation = /(?:\s(?:à|au|aux|in)\s+)([A-ZÀ-ÖØ-Ý][\p{L}\s-]{2,30})\s*\??$/u.test(text) && !specified;
    if (!hasUnknownLocation) {
      return { toolCode: "MCP_TIME_GET_CURRENT_TIME", args: { timezone: specified?.zone || "Africa/Kinshasa" } };
    }
  }

  const news = /(?:\bactualit[eé]s?\b|\bnouvelles?\b|\bnews\b)/i.test(text) &&
    /(?:\b(?:derni[eè]res?|r[eé]centes?|aujourd['’]hui|latest|breaking)\b|\b(?:sur|concernant|about|of)\b)/i.test(text);
  const explicitWeb = /\b(?:cherche|recherche|rechercher|chercher|trouve|trouver|search|look\s+up|find)\b.{0,70}\b(?:web|internet|en ligne|online|brave)\b/i.test(text) ||
    /^\s*(?:recherche\s+web|cherche\s+(?:sur\s+)?(?:internet|web)|search\s+(?:the\s+)?web)\b/i.test(text);

  if (!news && !explicitWeb) return null;

  const query = text
    .replace(/^(?:cherche(?:r)?|recherche(?:r)?|trouve(?:r)?|search|look up|find|montre|show)\s*/i, "")
    .replace(/^(?:(?:sur|dans)\s+)?(?:le\s+)?(?:web|internet|brave|en ligne)\s*/i, "")
    .replace(/^(?:(?:les|des|la|the)\s+)?(?:derni[eè]res?|latest|r[eé]centes?)\s*(?:actualit[eé]s?|nouvelles?|news)\s*(?:sur|concernant|about|de|du|des|of)?\s*/i, "")
    .replace(/^[\s:;,.-]+|[\s?!.]+$/g, "")
    .trim();
  if (query.length < 3 || query.length > 400) return null;
  return {
    toolCode: news ? "MCP_BRAVE_SEARCH_NEWS" : "MCP_BRAVE_SEARCH_WEB",
    args: { query, count: 5 },
  };
}

/**
 * Enterprise/sector assistants carry private context by default. Allow a
 * provider-independent Brave call only for an explicit public question that
 * was supplied directly by the signed-in user; never source a query from
 * ERP/RAG/CAG or from the model's proposed arguments.
 *
 * Conservative privacy filter: false negatives are preferable to a tenant
 * identifier, client record or personal data leaving the DTSC boundary.
 */
const privateEnterpriseSearch = /\b(?:notre|mon|ma|mes|nos|our|my)\s+(?:entreprise|organisation|organization|company|client|customer|employ[eé]|employee|patient|facture|invoice|compte|account|rapport|report|stock|projet|project|contrat|contract)\b|\b(?:patient|dossier|medical|m[eé]dical|facture|invoice|salaire|payroll|paie|employ[eé]|collaborateur|client|customer|contrat|contract|confidentiel|confidential|secret|interne|internal|identifiant|personal|personnel)\b|\b\d{6,}\b/i;

export function detectPublicAgentSearchIntent(content: string): PublicChatMcpIntent | null {
  if (content.length > 320 || privateEnterpriseSearch.test(content)) return null;
  const match = detectPublicChatMcpIntent(content);
  return match && (match.toolCode === "MCP_BRAVE_SEARCH_WEB" || match.toolCode === "MCP_BRAVE_SEARCH_NEWS")
    ? match : null;
}
