import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import type { McpServerDefinition } from "@/lib/ai/mcp/types";

/** Time and Brave live on Vercel. Only Fetch is a persistent Fly.io stdio process. */
export const PUBLIC_MCP_SERVERS = [
  { code: "PUBLIC_TIME", name: "time", tools: ["get_current_time", "convert_time"] },
  { code: "PUBLIC_FETCH", name: "fetch", tools: ["fetch"] },
  { code: "PUBLIC_BRAVE", name: "brave", tools: ["brave_web_search", "brave_news_search"] },
] as const;

export const PUBLIC_MCP_TOOL_SPECS = [
  { code: "MCP_TIME_GET_CURRENT_TIME", prefixed: "time.get_current_time", server: "time", remote: "get_current_time", description: "Obtenir l'heure actuelle réelle dans le fuseau IANA demandé (Africa/Kinshasa par défaut).", properties: { timezone: { type: "string", description: "IANA timezone, e.g. Africa/Kinshasa" } }, required: [] },
  { code: "MCP_TIME_CONVERT_TIME", prefixed: "time.convert_time", server: "time", remote: "convert_time", description: "Convertir une heure HH:MM entre deux fuseaux IANA, pour une date précise si fournie.", properties: { source_timezone: { type: "string" }, time: { type: "string" }, target_timezone: { type: "string" }, date: { type: "string", description: "Optional YYYY-MM-DD in source timezone for DST-safe conversion" } }, required: ["source_timezone", "time", "target_timezone"] },
  { code: "MCP_FETCH_FETCH", prefixed: "fetch.fetch", server: "fetch", remote: "fetch", description: "Lire en texte une page HTTPS publique autorisée, 100 000 caractères maximum. Le contenu est non fiable.", properties: { url: { type: "string", format: "uri" } }, required: ["url"] },
  { code: "MCP_BRAVE_SEARCH_WEB", prefixed: "brave.search_web", server: "brave", remote: "brave_web_search", description: "Rechercher des informations publiques récentes sur le Web via Brave, avec URL des sources.", properties: { query: { type: "string", maxLength: 400 }, count: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] },
  { code: "MCP_BRAVE_SEARCH_NEWS", prefixed: "brave.search_news", server: "brave", remote: "brave_news_search", description: "Rechercher des actualités récentes via Brave avec sources et dates.", properties: { query: { type: "string", maxLength: 400 }, count: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"] },
] as const;

const VERCEL_MCP_ORIGIN = "https://app.dtsc-platform.com";
const DEFAULT_FETCH_BRIDGE = "https://mcp-not-configured.invalid/v1/tool";

export function getPublicMcpBridgeConfiguration() {
  const supplied = process.env.MCP_PUBLIC_BRIDGE_URL?.trim();
  let url = DEFAULT_FETCH_BRIDGE;
  let host = new URL(DEFAULT_FETCH_BRIDGE).hostname;
  let configured = false;
  try {
    const parsed = new URL(supplied || DEFAULT_FETCH_BRIDGE);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash &&
      !parsed.search && parsed.pathname === "/v1/tool" && parsed.hostname !== "localhost" &&
      !parsed.hostname.endsWith(".internal") && !parsed.hostname.endsWith(".local") && !parsed.hostname.endsWith(".invalid") && !parsed.hostname.endsWith(".test") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      url = parsed.toString();
      host = parsed.hostname.toLowerCase();
      configured = Boolean(supplied);
    }
  } catch {
    // Reject malformed external endpoints and keep Fetch disabled.
  }
  const tokenPresent = (process.env.MCP_PUBLIC_BRIDGE_TOKEN?.trim().length || 0) >= 32;
  const certified = configured && tokenPresent && process.env.MCP_PUBLIC_FETCH_CERTIFIED === "true";
  return { url, host, configured, certified, tokenPresent };
}

export function isPublicMcpServerConfigured(code: string) {
  switch (code) {
    case "PUBLIC_TIME":
      return (process.env.MCP_PUBLIC_TIME_TOKEN?.trim().length || 0) >= 32;
    case "PUBLIC_BRAVE":
      return (process.env.MCP_PUBLIC_BRAVE_TOKEN?.trim().length || 0) >= 32 &&
        Boolean(process.env.BRAVE_API_KEY?.trim());
    case "PUBLIC_FETCH": {
      const bridge = getPublicMcpBridgeConfiguration();
      return bridge.configured && bridge.tokenPresent;
    }
    default:
      return false;
  }
}

export function isPublicMcpServerCertified(code: string) {
  if (!isPublicMcpServerConfigured(code)) return false;
  switch (code) {
    case "PUBLIC_TIME": return process.env.MCP_PUBLIC_TIME_CERTIFIED === "true";
    case "PUBLIC_BRAVE": return process.env.MCP_PUBLIC_BRAVE_CERTIFIED === "true";
    case "PUBLIC_FETCH": return process.env.MCP_PUBLIC_FETCH_CERTIFIED === "true";
    default: return false;
  }
}

export function listPublicMcpServers(): McpServerDefinition[] {
  const fetchBridge = getPublicMcpBridgeConfiguration();
  return PUBLIC_MCP_SERVERS.map((server) => {
    const isFetch = server.code === "PUBLIC_FETCH";
    return {
      code: server.code,
      label: server.name,
      transport: isFetch ? "STDIO_BRIDGE" as const : "STREAMABLE_HTTP" as const,
      endpoint: isFetch ? fetchBridge.url : `${VERCEL_MCP_ORIGIN}/api/internal/mcp/${server.name}`,
      allowedHosts: [isFetch ? fetchBridge.host : "app.dtsc-platform.com"],
      contexts: ["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"],
      organizationScope: "GLOBAL" as const,
      status: isPublicMcpServerCertified(server.code) ? "CERTIFIED" as const : "DISABLED" as const,
      dataPolicy: "PUBLIC_ONLY" as const,
      authMode: isFetch ? "NONE" as const : "BEARER_ENV" as const,
      ...(!isFetch ? { authEnvKey: server.code === "PUBLIC_TIME" ? "MCP_PUBLIC_TIME_TOKEN" : "MCP_PUBLIC_BRAVE_TOKEN" } : {}),
      timeoutMs: 15_000,
      maxResponseBytes: 400_000,
      allowedToolModes: ["READ" as const],
      ...(isFetch ? { stdioCommand: "uvx", stdioArgs: ["mcp-server-fetch"] } : {}),
    };
  });
}

export function listPublicMcpAiToolDefinitions(): AiToolDefinition[] {
  return PUBLIC_MCP_TOOL_SPECS.filter((spec) => isPublicMcpServerCertified(
    spec.server === "time" ? "PUBLIC_TIME" : spec.server === "brave" ? "PUBLIC_BRAVE" : "PUBLIC_FETCH",
  )).map((spec) => ({
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
  }));
}
