import { createHash } from "node:crypto";
import { callMcpJsonRpc } from "@/lib/ai/mcp/transport";
import { hashMcpSchema } from "@/lib/ai/mcp/schema";
import type { McpDiscoverySnapshot, McpDiscoveredTool, McpServerDefinition } from "@/lib/ai/mcp/types";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
}

function snapshotVersion(input: Omit<McpDiscoverySnapshot, "version" | "discoveredAt">) {
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex");
}

type ToolsListResult = { tools?: Array<{ name?: string; title?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown }> };
type ResourcesListResult = { resources?: Array<{ uri?: string; name?: string; mimeType?: string }> };
type PromptsListResult = { prompts?: Array<{ name?: string; description?: string }> };

export async function discoverMcpServer(server: McpServerDefinition): Promise<McpDiscoverySnapshot> {
  const toolsResult = await callMcpJsonRpc<ToolsListResult>({ server, method: "tools/list" });
  const tools: McpDiscoveredTool[] = (toolsResult.tools || []).flatMap((tool) => {
    if (!tool.name || !tool.inputSchema || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) return [];
    return [{
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      outputSchema: tool.outputSchema && typeof tool.outputSchema === "object" && !Array.isArray(tool.outputSchema) ? tool.outputSchema as Record<string, unknown> : null,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));

  let resources: McpDiscoverySnapshot["resources"] = [];
  let prompts: McpDiscoverySnapshot["prompts"] = [];
  try {
    const result = await callMcpJsonRpc<ResourcesListResult>({ server, method: "resources/list" });
    resources = (result.resources || []).flatMap((resource) => resource.uri ? [{ uri: resource.uri, name: resource.name, mimeType: resource.mimeType }] : []).sort((a, b) => a.uri.localeCompare(b.uri));
  } catch {
    resources = [];
  }
  try {
    const result = await callMcpJsonRpc<PromptsListResult>({ server, method: "prompts/list" });
    prompts = (result.prompts || []).flatMap((prompt) => prompt.name ? [{ name: prompt.name, description: prompt.description }] : []).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    prompts = [];
  }

  const core = { serverCode: server.code, tools, resources, prompts };
  return { ...core, version: snapshotVersion(core), discoveredAt: new Date().toISOString() };
}

export function compareMcpDiscovery(previous: McpDiscoverySnapshot | null, next: McpDiscoverySnapshot) {
  if (!previous) return { compatible: true, addedTools: next.tools.map((tool) => tool.name), removedTools: [], changedTools: [] };
  const previousMap = new Map(previous.tools.map((tool) => [tool.name, tool]));
  const nextMap = new Map(next.tools.map((tool) => [tool.name, tool]));
  const addedTools = next.tools.filter((tool) => !previousMap.has(tool.name)).map((tool) => tool.name);
  const removedTools = previous.tools.filter((tool) => !nextMap.has(tool.name)).map((tool) => tool.name);
  const changedTools = next.tools.flatMap((tool) => {
    const before = previousMap.get(tool.name);
    if (!before) return [];
    const inputChanged = hashMcpSchema(before.inputSchema) !== hashMcpSchema(tool.inputSchema);
    const outputChanged = hashMcpSchema(before.outputSchema || {}) !== hashMcpSchema(tool.outputSchema || {});
    return inputChanged || outputChanged ? [tool.name] : [];
  });
  return { compatible: removedTools.length === 0 && changedTools.length === 0, addedTools, removedTools, changedTools };
}

export function getDiscoveredMcpTool(snapshot: McpDiscoverySnapshot, name: string) {
  return snapshot.tools.find((tool) => tool.name === name) || null;
}
