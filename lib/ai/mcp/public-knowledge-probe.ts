import "server-only";
import { createHash } from "node:crypto";
import { PUBLIC_MCP_SERVERS, getPublicMcpBridgeConfiguration } from "@/lib/ai/mcp/public-knowledge-config";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { validateMcpEndpointResolution } from "@/lib/ai/mcp/security";
import { callMcpJsonRpc } from "@/lib/ai/mcp/transport";

export type PublicMcpLiveProbe = {
  checkedAt: string;
  fingerprint: string;
  tools: string[];
};

async function probeOne(code: string): Promise<PublicMcpLiveProbe | null> {
  const server = getMcpServerDefinition(code);
  const expected = PUBLIC_MCP_SERVERS.find((entry) => entry.code === code);
  if (!server || !expected || server.status !== "CERTIFIED") return null;
  let discovered: unknown;
  if (server.transport === "STREAMABLE_HTTP") {
    try {
      const response = await callMcpJsonRpc<{ tools?: Array<{ name?: string }> }>({ server: { ...server, timeoutMs: 4_000 }, method: "tools/list" });
      discovered = response.tools?.map((entry) => entry.name);
    } catch { return null; }
  } else {
    const bridge = getPublicMcpBridgeConfiguration();
    if (!bridge.certified || !(await validateMcpEndpointResolution(server)).allowed) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const endpoint = new URL(bridge.url);
      endpoint.pathname = "/v1/certification";
      const response = await fetch(endpoint.toString(), {
        method: "GET", headers: { authorization: `Bearer ${process.env.MCP_PUBLIC_BRIDGE_TOKEN?.trim() || ""}` },
        redirect: "manual", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok || Number(response.headers.get("content-length") || "0") > 32_000) return null;
      const body = await response.text();
      if (body.length > 32_000) return null;
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || !("ready" in parsed) || parsed.ready !== true ||
        !("servers" in parsed) || !Array.isArray(parsed.servers)) return null;
      const item: unknown = parsed.servers.find((entry: unknown) => entry && typeof entry === "object" && "server" in entry && entry.server === "fetch");
      discovered = item && typeof item === "object" && "tools" in item ? item.tools : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  if (!Array.isArray(discovered) || !expected.tools.every((name) => discovered.includes(name))) return null;
  const tools = [...expected.tools];
  return {
    checkedAt: new Date().toISOString(),
    fingerprint: createHash("sha256").update(JSON.stringify({ code, tools })).digest("hex"),
    tools,
  };
}

/** A credential or feature flag is never considered live discovery evidence. */
export async function probePublicMcpServers(): Promise<Record<string, PublicMcpLiveProbe | null>> {
  const outcomes = await Promise.all(PUBLIC_MCP_SERVERS.map(async ({ code }) => [code, await probeOne(code)] as const));
  return Object.fromEntries(outcomes);
}
