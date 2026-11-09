import "server-only";
import { createHash } from "node:crypto";
import { getPublicMcpBridgeConfiguration, PUBLIC_MCP_SERVERS } from "@/lib/ai/mcp/public-knowledge-config";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { validateMcpEndpointResolution } from "@/lib/ai/mcp/security";

type PublicMcpBridgeProbe = {
  checkedAt: string;
  fingerprint: string;
  toolsByServer: Record<string, string[]>;
};

/**
 * Live discovery only. Certification in environment is a precondition, never
 * evidence of a healthy running stdio server. No user data or secrets returned.
 */
export async function probePublicMcpBridge(): Promise<PublicMcpBridgeProbe | null> {
  const bridge = getPublicMcpBridgeConfiguration();
  if (!bridge.certified) return null;
  const time = getMcpServerDefinition("PUBLIC_TIME");
  if (!time || time.transport !== "STDIO_BRIDGE" || time.status !== "CERTIFIED") return null;
  const allowed = await validateMcpEndpointResolution(time);
  if (!allowed.allowed) return null;
  const token = process.env.MCP_PUBLIC_BRIDGE_TOKEN?.trim();
  if (!token) return null;
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), 4_000);
  try {
    const endpoint = new URL(bridge.url);
    endpoint.pathname = "/v1/certification";
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      redirect: "manual", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok || response.status >= 300 && response.status < 400 ||
      Number(response.headers.get("content-length") || "0") > 32_000) return null;
    const source = await response.text();
    if (source.length > 32_000) return null;
    const data: unknown = JSON.parse(source);
    if (!data || typeof data !== "object" || !("ready" in data) || data.ready !== true ||
      !("servers" in data) || !Array.isArray(data.servers)) return null;
    const toolsByServer: Record<string, string[]> = {};
    for (const server of PUBLIC_MCP_SERVERS) {
      const found = (data.servers as unknown[]).find((row) => row && typeof row === "object" &&
        "server" in row && row.server === server.name);
      if (!found || typeof found !== "object" || !("tools" in found) || !Array.isArray(found.tools) ||
        !server.tools.every((name) => found.tools.includes(name))) return null;
      // Only reviewed tool names are returned to the Console UI.
      toolsByServer[server.name] = [...server.tools];
    }
    return {
      checkedAt: new Date().toISOString(),
      fingerprint: createHash("sha256").update(JSON.stringify(toolsByServer)).digest("hex"),
      toolsByServer,
    };
  } catch {
    // Remote metadata/response is untrusted. Fail closed without logging
    // response bodies, tokens, URLs, or exception messages.
    return null;
  } finally {
    clearTimeout(abort);
  }
}
