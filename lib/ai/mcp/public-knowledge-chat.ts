import "server-only";
import { randomUUID } from "node:crypto";
import type { AiDataClassification } from "@/lib/ai/types";
import type { SessionPayload } from "@/lib/session";
import { executeAiTool } from "@/lib/ai/tools/execute";
import { detectPublicChatMcpIntent } from "@/lib/ai/mcp/public-knowledge-chat-intent";

type Locale = "fr" | "en";
type ReadResult = { tool?: unknown; content?: unknown; sources?: unknown; untrusted?: unknown };
type SearchHit = { title?: unknown; url?: unknown; description?: unknown; age?: unknown };

function textValue(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max)
    : "";
}

function markdownText(value: unknown, max = 400) {
  return textValue(value, max).replace(/[\\`*_[\]()#<>!]/g, "\\$&");
}

function renderPublicTime(raw: unknown, locale: Locale, timezone: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { utc_datetime?: unknown; timezone?: unknown };
  if (typeof value.utc_datetime !== "string" || typeof value.timezone !== "string") return null;
  if (value.timezone !== timezone) return null;
  const instant = new Date(value.utc_datetime);
  if (!Number.isFinite(instant.valueOf())) return null;
  const formatted = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: value.timezone,
  }).format(instant);
  return locale === "en"
    ? `The current date and time in **${value.timezone}** is **${formatted}**. Source: **DTSC Time** (live MCP tool).`
    : `La date et l'heure actuelles dans le fuseau **${value.timezone}** sont : **${formatted}**. Source : **DTSC Time** (outil MCP en direct).`;
}

function renderPublicSearch(raw: unknown, locale: Locale, news: boolean): string | null {
  if (!raw || typeof raw !== "object") return null;
  const result = raw as { results?: unknown };
  if (!Array.isArray(result.results)) return null;
  const entries = (result.results as SearchHit[]).slice(0, 5).flatMap((hit, index) => {
    if (!hit || typeof hit !== "object" || typeof hit.url !== "string") return [];
    let url: URL;
    try { url = new URL(hit.url); }
    catch { return []; }
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const safeUrl = url.toString().replace(/\)/g, "%29");
    const title = markdownText(hit.title || url.hostname, 220);
    const description = markdownText(hit.description, 360);
    return [`${index + 1}. [${title}](${safeUrl})${description ? ` — ${description}` : ""}`];
  });
  const heading = locale === "en"
    ? (news ? "Recent news results from Brave Search:" : "Public web results from Brave Search:")
    : (news ? "Résultats d'actualités provenant de Brave Search :" : "Résultats Web publics provenant de Brave Search :");
  return entries.length
    ? `${heading}\n\n${entries.join("\n\n")}\n\n${locale === "en" ? "These excerpts are third-party information, not verified DTSC instructions." : "Ces extraits proviennent de sources externes : ils ne constituent pas des instructions DTSC vérifiées."}`
    : locale === "en" ? "Brave Search returned no public sources for this request." : "Brave Search n'a renvoyé aucune source publique pour cette recherche.";
}

export type StandardChatMcpAnswer = {
  toolCode: string;
  status: "SUCCESS" | "UNAVAILABLE";
  reply: string;
};

/**
 * Only explicit public Time and Brave requests are handled in standard chat.
 * The audited canonical Tool Gateway enforces session, plan, public-data
 * classification, rate limits and per-tool suspension; it writes execution
 * and MCP audit events. No tenant data or raw credentials reach Brave.
 */
export async function getStandardChatPublicMcpAnswer(input: {
  content: string;
  locale: Locale;
  session: SessionPayload;
  userId: string;
  conversationId: string;
  dataClassifications: AiDataClassification[];
  request: Request;
}): Promise<StandardChatMcpAnswer | null> {
  const intent = detectPublicChatMcpIntent(input.content);
  if (!intent) return null;

  const unavailable = input.locale === "en"
    ? "The requested DTSC MCP tool is currently unavailable or not authorized. I cannot provide an unverified time or invent search results."
    : "L'outil MCP DTSC demandé est momentanément indisponible ou non autorisé. Je ne peux pas inventer une heure ou des résultats non vérifiés.";

  try {
    const execution = await executeAiTool({
      toolCode: intent.toolCode,
      args: intent.args,
      context: {
        // This route has already authorized a PERSONAL AI turn with no
        // organization data. A user may still have an ORGANIZATION workspace
        // selected in their signed session; narrow this public READ call to
        // GLOBAL_CLIENT instead of accidentally requiring enterprise AI rights.
        // Never persist or sign this derived identity; keep the real user and
        // session ID, and only permit this fixed Time/Brave intent allowlist.
        session: {
          ...input.session,
          activeContext: "GLOBAL_CLIENT",
          activeOrganizationId: null,
          activeOrganizationName: null,
          activeOrganizationRole: null,
        },
        userId: input.userId,
        organizationId: null,
        conversationId: input.conversationId,
        turnId: `chat-v2:${randomUUID()}`,
        assistantCode: "DTSC_GENERAL",
        dataClassifications: input.dataClassifications,
        request: input.request,
      },
    });
    if (!execution.ok) return { toolCode: intent.toolCode, status: "UNAVAILABLE", reply: unavailable };

    const output = execution.result as ReadResult | undefined;
    if (!output || output.untrusted !== true || typeof output.content !== "string") {
      return { toolCode: intent.toolCode, status: "UNAVAILABLE", reply: unavailable };
    }
    const parsed: unknown = JSON.parse(output.content);
    const rendered = intent.toolCode === "MCP_TIME_GET_CURRENT_TIME"
      ? renderPublicTime(parsed, input.locale, intent.args.timezone)
      : renderPublicSearch(parsed, input.locale, intent.toolCode === "MCP_BRAVE_SEARCH_NEWS");
    return { toolCode: intent.toolCode, status: rendered ? "SUCCESS" : "UNAVAILABLE", reply: rendered || unavailable };
  } catch {
    // The user sees neither a secret-bearing exception nor an invented fact.
    return { toolCode: intent.toolCode, status: "UNAVAILABLE", reply: unavailable };
  }
}
