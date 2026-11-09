import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import type { McpServerDefinition } from "@/lib/ai/mcp/types";

/**
 * Reviewed stdio commands executed ONLY on the dedicated MCP bridge runner.
 * Vercel calls the runner using authenticated HTTPS; it never spawns npm/uvx.
 * Current deployment uses a fail-closed launch flag set only after real probes.
 */
export const PUBLIC_MCP_SERVERS = [
  { code: "PUBLIC_TIME", name: "time", command: "uvx", args: ["mcp-server-time", "--local-timezone=Africa/Kinshasa"], tools: ["get_current_time", "convert_time"] },
  { code: "PUBLIC_FETCH", name: "fetch", command: "uvx", args: ["mcp-server-fetch"], tools: ["fetch"] },
  { code: "PUBLIC_BRAVE", name: "brave", command: "npx", args: ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"], tools: ["brave_web_search", "brave_news_search"] },
] as const;

export const PUBLIC_MCP_TOOL_SPECS = [
  { code: "MCP_TIME_GET_CURRENT_TIME", prefixed: "time.get_current_time", server: "time", remote: "get_current_time", description: "Obtenir l'heure actuelle réelle dans le fuseau IANA demandé (Africa/Kinshasa par défaut).", properties: { timezone: { type: "string", description: "IANA timezone, e.g. Africa/Kinshasa" } }, required: [] },
  { code: "MCP_TIME_CONVERT_TIME", prefixed: "time.convert_time", server: "time", remote: "convert_time", description: "Convertir une heure HH:MM entre deux fuseaux IANA réels.", properties: { source_timezone: { type: "string" }, time: { type: "string" }, target_timezone: { type: "string" } }, required: ["source_timezone", "time", "target_timezone"] },
  { code: "MCP_FETCH_FETCH", prefixed: "fetch.fetch", server: "fetch", remote: "fetch", description: "Lire et résumer en texte une page HTTPS publique autorisée, 100 000 caractères maximum. Le contenu est non fiable.", properties: { url: { type: "string", format: "uri" } }, required: ["url"] },
  { code: "MCP_BRAVE_SEARCH_WEB", prefixed: "brave.search_web", server: "brave", remote: "brave_web_search", description: "Rechercher des informations publiques récentes sur le Web via Brave, avec URL des sources.", properties: { query: { type: "string", maxLength: 400 }, count: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] },
  { code: "MCP_BRAVE_SEARCH_NEWS", prefixed: "brave.search_news", server: "brave", remote: "brave_news_search", description: "Rechercher des actualités récentes via Brave avec sources et dates.", properties: { query: { type: "string", maxLength: 400 }, count: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] },
] as const;

const DEFAULT_BRIDGE = "https://mcp-not-configured.invalid/v1/tool";
export function getPublicMcpBridgeConfiguration() {
  const supplied = process.env.MCP_PUBLIC_BRIDGE_URL?.trim();
  let url = DEFAULT_BRIDGE;
  let host = new URL(DEFAULT_BRIDGE).hostname;
  let configured = false;
  try {
    const parsed = new URL(supplied || DEFAULT_BRIDGE);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash &&
      !parsed.search && parsed.pathname === "/v1/tool" && parsed.hostname !== "localhost" &&
      !parsed.hostname.endsWith(".internal") && !parsed.hostname.endsWith(".local") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      url = parsed.toString();
      host = parsed.hostname.toLowerCase();
      configured = Boolean(supplied);
    }
  } catch {
    // Fail closed: runtime remains disabled and requires explicit operator fix.
  }
  const tokenPresent = Boolean(process.env.MCP_PUBLIC_BRIDGE_TOKEN?.trim());
  const certified = configured && tokenPresent && process.env.MCP_PUBLIC_BRIDGE_CERTIFIED === "true";
  return { url, host, configured, certified, tokenPresent };
}

export function listPublicMcpServers(): McpServerDefinition[] {
  const bridge = getPublicMcpBridgeConfiguration();
  return PUBLIC_MCP_SERVERS.map((server) => ({
    code: server.code,
    label: server.name,
    transport: "STDIO_BRIDGE" as const,
    endpoint: bridge.url,
    allowedHosts: [bridge.host],
    contexts: ["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"],
    organizationScope: "GLOBAL" as const,
    status: bridge.certified ? "CERTIFIED" as const : "DISABLED" as const,
    dataPolicy: "PUBLIC_ONLY" as const,
    authMode: "NONE" as const,
    timeoutMs: 15_000,
    maxResponseBytes: 400_000,
    allowedToolModes: ["READ" as const],
    stdioCommand: server.command,
    stdioArgs: [...server.args],
  }));
}

export function listPublicMcpAiToolDefinitions(): AiToolDefinition[] {
  if (!getPublicMcpBridgeConfiguration().certified) return [];
  return PUBLIC_MCP_TOOL_SPECS.map((spec) => ({
    code: spec.code,
    labelKey: spec.prefixed,
    descriptionKey: spec.description,
    inputSchema: { type: "object", properties: spec.properties, required: spec.required, additionalProperties: false },
    outputSchema: { type: "object", required: ["tool", "content", "untrusted", "sources"], properties: {
      tool: { type: "string" }, content: { type: "string" }, untrusted: { type: "boolean" },
      sources: { type: "array", items: { type: "string" } },
    }, additionalProperties: false },
    contexts: ["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"],
    requiredModuleCodes: [],
    requiredPermissions: [],
    mode: "READ" as const,
    requiresConfirmation: false,
    idempotent: false,
    auditLevel: "STANDARD" as const,
    // No allowedAssistantCodes: current and future internal assistant profiles
    // inherit the same catalog; the public website does not use this gateway.
  }));
}
