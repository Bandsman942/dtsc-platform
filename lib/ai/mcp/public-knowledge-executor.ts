import dns from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { writeMcpAuditEvent } from "@/lib/ai/mcp/audit";
import { PUBLIC_MCP_TOOL_SPECS, getPublicMcpBridgeConfiguration, isPublicMcpServerCertified } from "@/lib/ai/mcp/public-knowledge-config";
import { validateMcpEndpointResolution } from "@/lib/ai/mcp/security";
import { callMcpJsonRpc } from "@/lib/ai/mcp/transport";
import { assertMcpServerNotSuspended } from "@/lib/ai/mcp/control";
import { rateLimit } from "@/lib/rate-limit";
import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";

const zone = z.string().min(2).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
});
const search = z.object({ query: z.string().trim().min(1).max(400), count: z.number().int().min(1).max(10).optional() }).strict();
export const PUBLIC_KNOWLEDGE_INPUT_SCHEMAS = {
  MCP_TIME_GET_CURRENT_TIME: z.object({ timezone: zone.optional().default("Africa/Kinshasa") }).strict(),
  MCP_TIME_CONVERT_TIME: z.object({
    source_timezone: zone,
    target_timezone: zone,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).strict(),
  MCP_FETCH_FETCH: z.object({ url: z.string().url().min(8).max(2048) }).strict(),
  MCP_BRAVE_SEARCH_WEB: search,
  MCP_BRAVE_SEARCH_NEWS: search,
} as const;

export const PUBLIC_KNOWLEDGE_OUTPUT_SCHEMA = z.object({
  tool: z.string().min(3).max(60),
  content: z.string().max(160_000),
  untrusted: z.literal(true),
  sources: z.array(z.string().url().max(2048)).max(16),
}).strict();

function isPublicIp(value: string): boolean {
  const ip = value.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113 ||
      a === 192 && b === 0 && c === 2);
  }
  if (isIP(ip) === 6) {
    if (ip === "::" || ip === "::1" || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith("2001:db8:")) return false;
    if (ip.includes("::ffff:") || /^::\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
    return true;
  }
  return false;
}

export async function validatePublicKnowledgeFetchUrl(raw: string): Promise<string> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("MCP_FETCH_URL_INVALID"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash ||
    (url.port && !["80","443"].includes(url.port))) throw new Error("MCP_FETCH_URL_INVALID");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (["localhost", "metadata", "metadata.google.internal", "169.254.169.254", "100.100.100.200"].includes(host) ||
    /\.(localhost|internal|local|lan|home|test|invalid)$/.test(host)) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
  } else {
    if (/^\d+(?:\.\d+){0,3}$/.test(host)) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
    let addresses: Array<{ address: string }>;
    try { addresses = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error("MCP_FETCH_DNS_UNAVAILABLE"); }
    if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) throw new Error("MCP_FETCH_PRIVATE_ADDRESS_FORBIDDEN");
  }
  return url.toString();
}

function resolveTurnKey(context: AiToolRuntimeContext) {
  // Agent run IDs persist for a single user request even when steps increment.
  // Requests without a structured run use a stricter user+minute quota below.
  const raw = context.turnId?.split(":")[0] || context.conversationId || "direct";
  return raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180) || "direct";
}

function assertPublicOnly(context: AiToolRuntimeContext) {
  // Public Web results must NEVER receive confidential user or tenant material.
  const classes: ReadonlySet<string> = new Set(context.dataClassifications || []);
  if (["CONFIDENTIAL", "RESTRICTED", "HEALTH_SENSITIVE", "HR_SENSITIVE", "FINANCIAL_SENSITIVE", "LEGAL_SENSITIVE", "SECRET"].some((sensitivity) => classes.has(sensitivity))) {
    throw new Error("MCP_PUBLIC_DATA_ONLY");
  }
}

export async function executePublicKnowledgeTool({ code, args, context }: { code: string; args: unknown; context: AiToolRuntimeContext }) {
  const spec = PUBLIC_MCP_TOOL_SPECS.find((entry) => entry.code === code);
  if (!spec) throw new Error("MCP_PUBLIC_TOOL_UNREGISTERED");
  const serverCode = spec.server === "brave" ? "PUBLIC_BRAVE" : spec.server === "fetch" ? "PUBLIC_FETCH" : "PUBLIC_TIME";
  const server = getMcpServerDefinition(serverCode);
  if (!server || server.status !== "CERTIFIED" || !isPublicMcpServerCertified(serverCode)) throw new Error("MCP_PUBLIC_SERVER_NOT_CERTIFIED");
  const started = Date.now();
  const auditBase = { userId: context.userId, organizationId: context.organizationId || null,
    serverCode, dtscToolCode: code, remoteToolName: spec.prefixed };
  let status: "SUCCESS" | "DENIED" | "FAILED" = "FAILED";
  let reasonCode: string | undefined;
  try {
    assertPublicOnly(context);
    await assertMcpServerNotSuspended(server.code);
    const countKey = `mcp-public:${context.userId}:${resolveTurnKey(context)}`;
    // Redis-backed cross-instance budget, at most 10 per user turn; 10/minute
    // additionally prevents unbounded direct calls without an agent run.
    const [turnLimiter, minuteLimiter] = await Promise.all([
      rateLimit(countKey, 10, 120_000),
      rateLimit(`mcp-public-minute:${context.userId}`, 10, 60_000),
    ]);
    if (!turnLimiter.ok || !minuteLimiter.ok) throw new Error("MCP_REQUEST_TOOL_LIMIT");
    const sanitized = (PUBLIC_KNOWLEDGE_INPUT_SCHEMAS as Record<string, z.ZodTypeAny>)[code].parse(args) as Record<string, unknown>;
    if (spec.server === "fetch") sanitized.url = await validatePublicKnowledgeFetchUrl(String(sanitized.url));
    if (server.transport === "STREAMABLE_HTTP") {
      const result = await callMcpJsonRpc<{ isError?: boolean; content?: Array<{ type: string; text?: string }> }>({
        server, method: "tools/call", params: { name: spec.remote, arguments: sanitized },
      });
      if (result.isError || !Array.isArray(result.content)) throw new Error("MCP_PUBLIC_REMOTE_ERROR");
      const content = result.content.filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text).join("\n").slice(0, 160_000);
      const sources = spec.server === "brave"
        ? [...new Set((content.match(/https?:\/\/[^\s"'<>]+/g) || []).map((url) => url.replace(/\\+$/, "")))].filter((url) => url.length <= 2048).slice(0, 16)
        : [];
      status = "SUCCESS";
      return { tool: spec.prefixed, content, sources, untrusted: true };
    }
    if (server.transport !== "STDIO_BRIDGE" || spec.server !== "fetch") throw new Error("MCP_PUBLIC_TRANSPORT_INVALID");
    const bridge = getPublicMcpBridgeConfiguration();
    const gate = await validateMcpEndpointResolution(server);
    if (!gate.allowed) throw new Error(gate.reasonCode);
    const token = process.env.MCP_PUBLIC_BRIDGE_TOKEN?.trim();
    if (!token) throw new Error("MCP_PUBLIC_BRIDGE_TOKEN_MISSING");
    const body = JSON.stringify({
      userId: context.userId, assistant: context.assistantCode || "DTSC_GENERAL",
      turnKey: resolveTurnKey(context), tool: spec.prefixed, args: sanitized,
    });
    // 15 s across BOTH attempts in total. Never automatically retry a 4xx.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(bridge.url, {
          method: "POST", redirect: "manual", cache: "no-store", signal: controller.signal,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body,
        });
        if (response.status >= 300 && response.status < 400) throw new Error("MCP_BRIDGE_REDIRECT_FORBIDDEN");
        if (!response.ok) {
          if (response.status === 422) {
            const body = await response.json().catch(() => ({})) as { error?: string };
            const safeCode = typeof body.error === "string" && /^MCP_[A-Z_]{3,80}$/.test(body.error)
              ? body.error : "MCP_PUBLIC_TOOL_INPUT_REJECTED";
            throw new Error(safeCode);
          }
          if (response.status === 429) throw new Error("MCP_REQUEST_TOOL_LIMIT");
          if (attempt === 0 && response.status >= 500) continue;
          throw new Error("MCP_PUBLIC_BRIDGE_UNAVAILABLE");
        }
        const declaredSize = Number(response.headers.get("content-length") || "0");
        if (declaredSize > 400_000) throw new Error("MCP_BRIDGE_RESPONSE_TOO_LARGE");
        const resultText = await response.text();
        if (resultText.length > 400_000) throw new Error("MCP_BRIDGE_RESPONSE_TOO_LARGE");
        const result = PUBLIC_KNOWLEDGE_OUTPUT_SCHEMA.parse(JSON.parse(resultText));
        if (result.tool !== spec.prefixed) throw new Error("MCP_BRIDGE_TOOL_MISMATCH");
        if (spec.server === "fetch" && result.content.length > 100_000) throw new Error("MCP_FETCH_RESPONSE_TOO_LARGE");
        status = "SUCCESS";
        return result;
      }
      throw new Error("MCP_PUBLIC_BRIDGE_UNAVAILABLE");
    } finally { clearTimeout(timer); }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    // Only stable, reviewed error codes are allowed in durable audit records.
    // Zod/network exceptions may otherwise expose user arguments or URLs.
    reasonCode = /^MCP_[A-Z0-9_]{3,80}$/.test(code) ? code : error instanceof z.ZodError ? "MCP_ARGS_INVALID" : "MCP_PUBLIC_FAILED";
    // Never log raw input, output, query, URL, tokens or proprietary data.
    status = /FORBIDDEN|LIMIT|ONLY|INVALID|NOT_CERTIFIED/.test(reasonCode) ? "DENIED" : "FAILED";
    throw error;
  } finally {
    await writeMcpAuditEvent({ ...auditBase, eventType: "TOOL_CALL", status, reasonCode,
      metadata: { assistantCode: context.assistantCode || "DTSC_GENERAL", at: new Date().toISOString(), durationMs: Date.now() - started } });
  }
}

export const PUBLIC_KNOWLEDGE_EXECUTORS: Record<string, AiToolExecutor> = Object.fromEntries(
  PUBLIC_MCP_TOOL_SPECS.filter((spec) => isPublicMcpServerCertified(
    spec.server === "time" ? "PUBLIC_TIME" : spec.server === "brave" ? "PUBLIC_BRAVE" : "PUBLIC_FETCH",
  )).map((spec) => [spec.code, ({ args, context }: Parameters<AiToolExecutor>[0]) => executePublicKnowledgeTool({ code: spec.code, args, context })]),
);
