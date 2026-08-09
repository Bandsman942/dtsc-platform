import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import { validateMcpEndpointResolution } from "@/lib/ai/mcp/security";

let requestId = 0;

export async function callMcpJsonRpc<T>(input: {
  server: McpServerDefinition;
  method: string;
  params?: Record<string, unknown>;
}) {
  const endpoint = await validateMcpEndpointResolution(input.server);
  if (!endpoint.allowed) throw new Error(endpoint.reasonCode);
  if (input.server.status !== "CERTIFIED") throw new Error("MCP_SERVER_NOT_CERTIFIED");

  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  if (input.server.authMode === "BEARER_ENV") {
    const envKey = input.server.authEnvKey || "";
    const token = envKey ? process.env[envKey] : undefined;
    if (!token) throw new Error("MCP_SERVER_AUTH_MISSING");
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.server.timeoutMs);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: input.method, params: input.params || {} }),
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
    if (!contentType.includes("application/json")) throw new Error("MCP_SSE_NOT_ENABLED_IN_AI07_BASELINE");
    const body = JSON.parse(text) as { result?: T; error?: { code?: number; message?: string } };
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
