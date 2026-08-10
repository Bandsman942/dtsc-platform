import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import { encodeMcpHeaderValue } from "@/lib/ai/mcp/schema";
import { validateMcpEndpointResolution } from "@/lib/ai/mcp/security";

export const DTSC_MCP_PROTOCOL_VERSION = "2026-07-28";
const DTSC_MCP_CLIENT_INFO = { name: "dtsc-platform", version: "1.0.0" } as const;
let requestId = 0;

function requestName(method: string, params: Record<string, unknown>) {
  if (method === "tools/call" || method === "prompts/get") return typeof params.name === "string" ? params.name : null;
  if (method === "resources/read") return typeof params.uri === "string" ? params.uri : null;
  return null;
}

function validateAdditionalHeaders(headers: Record<string, string>) {
  for (const [name, value] of Object.entries(headers)) {
    if (!/^Mcp-Param-[!#$%&'*+.^_`|~0-9A-Za-z-]+$/i.test(name)) throw new Error("MCP_CUSTOM_HEADER_NAME_INVALID");
    if (/\r|\n/.test(value)) throw new Error("MCP_CUSTOM_HEADER_VALUE_INVALID");
  }
}

type JsonRpcEnvelope<T> = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: T;
  error?: { code?: number; message?: string; data?: unknown };
};

function parseJsonRpcEnvelope<T>(value: unknown): JsonRpcEnvelope<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MCP_RESPONSE_JSON_RPC_INVALID");
  return value as JsonRpcEnvelope<T>;
}

function parseSseJsonRpcResponse<T>(payload: string, expectedId: number): JsonRpcEnvelope<T> {
  const blocks = payload.replace(/\r\n/g, "\n").split(/\n\n+/);
  let finalResponse: JsonRpcEnvelope<T> | null = null;
  for (const block of blocks) {
    const lines = block.split("\n");
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error("MCP_SSE_JSON_INVALID");
    }
    const envelope = parseJsonRpcEnvelope<T>(parsed);
    if (envelope.id === expectedId) finalResponse = envelope;
  }
  if (!finalResponse) throw new Error("MCP_SSE_FINAL_RESPONSE_MISSING");
  return finalResponse;
}

export async function callMcpJsonRpc<T>(input: {
  server: McpServerDefinition;
  method: string;
  params?: Record<string, unknown>;
  additionalHeaders?: Record<string, string>;
}) {
  const endpoint = await validateMcpEndpointResolution(input.server);
  if (!endpoint.allowed) throw new Error(endpoint.reasonCode);
  if (input.server.status !== "CERTIFIED") throw new Error("MCP_SERVER_NOT_CERTIFIED");

  const params = input.params || {};
  const name = requestName(input.method, params);
  const additionalHeaders = input.additionalHeaders || {};
  validateAdditionalHeaders(additionalHeaders);
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": DTSC_MCP_PROTOCOL_VERSION,
    "Mcp-Method": input.method,
    ...(name ? { "Mcp-Name": encodeMcpHeaderValue(name) } : {}),
    ...additionalHeaders,
  };
  if (input.server.authMode === "BEARER_ENV") {
    const envKey = input.server.authEnvKey || "";
    const token = envKey ? process.env[envKey] : undefined;
    if (!token) throw new Error("MCP_SERVER_AUTH_MISSING");
    headers.Authorization = `Bearer ${token}`;
  }

  const id = ++requestId;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.server.timeoutMs);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: input.method,
        params: {
          ...params,
          _meta: {
            ...(params._meta && typeof params._meta === "object" && !Array.isArray(params._meta) ? params._meta as Record<string, unknown> : {}),
            "io.modelcontextprotocol/protocolVersion": DTSC_MCP_PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientInfo": DTSC_MCP_CLIENT_INFO,
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) throw new Error("MCP_REDIRECT_FORBIDDEN");
    if (!response.ok) throw new Error(`MCP_HTTP_${response.status}`);

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("application/json") && !contentType.includes("text/event-stream")) throw new Error("MCP_RESPONSE_CONTENT_TYPE_INVALID");
    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > input.server.maxResponseBytes) throw new Error("MCP_RESPONSE_TOO_LARGE");

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > input.server.maxResponseBytes) throw new Error("MCP_RESPONSE_TOO_LARGE");
    const text = new TextDecoder().decode(buffer);
    let body: JsonRpcEnvelope<T>;
    if (contentType.includes("text/event-stream")) {
      body = parseSseJsonRpcResponse<T>(text, id);
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("MCP_RESPONSE_JSON_INVALID");
      }
      body = parseJsonRpcEnvelope<T>(parsed);
    }
    if (body.error) throw new Error(`MCP_REMOTE_ERROR_${body.error.code || "UNKNOWN"}`);
    if (body.result === undefined) throw new Error("MCP_RESPONSE_RESULT_MISSING");
    return body.result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("MCP_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
