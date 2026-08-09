import { z } from "zod";
import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import { validateMcpEndpoint } from "@/lib/ai/mcp/security";

const serverSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{3,80}$/),
  label: z.string().min(2).max(120),
  transport: z.literal("STREAMABLE_HTTP"),
  endpoint: z.string().url(),
  allowedHosts: z.array(z.string().min(1)).min(1).max(8),
  contexts: z.array(z.enum(["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"])).min(1),
  organizationScope: z.enum(["GLOBAL", "TENANT"]),
  status: z.enum(["DISABLED", "CERTIFIED", "SUSPENDED"]),
  dataPolicy: z.enum(["PUBLIC_ONLY", "BUSINESS_ALLOWED", "SENSITIVE_CERTIFIED"]),
  authMode: z.enum(["NONE", "BEARER_ENV"]),
  authEnvKey: z.string().regex(/^[A-Z][A-Z0-9_]*$/).nullable().optional(),
  timeoutMs: z.number().int().min(500).max(30_000).default(8_000),
  maxResponseBytes: z.number().int().min(1_024).max(5_000_000).default(1_000_000),
  allowedToolModes: z.array(z.enum(["READ", "PREPARE", "MUTATE", "SENSITIVE_MUTATE"])).min(1),
}).strict();

function loadConfiguredServers(): McpServerDefinition[] {
  const raw = process.env.DTSC_MCP_SERVERS_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DTSC_MCP_SERVERS_JSON_INVALID_JSON");
  }
  const result = z.array(serverSchema).safeParse(parsed);
  if (!result.success) throw new Error("DTSC_MCP_SERVERS_JSON_INVALID_SCHEMA");
  return result.data;
}

export const MCP_SERVER_REGISTRY: McpServerDefinition[] = loadConfiguredServers();

export function getMcpServerDefinition(code: string) {
  return MCP_SERVER_REGISTRY.find((server) => server.code === code) || null;
}

export function listCertifiedMcpServers() {
  return MCP_SERVER_REGISTRY.filter((server) => server.status === "CERTIFIED");
}

export function assertMcpServerRegistryIntegrity() {
  const failures: string[] = [];
  const codes = new Set<string>();
  for (const server of MCP_SERVER_REGISTRY) {
    if (codes.has(server.code)) failures.push(`${server.code}: duplicate MCP server code`);
    codes.add(server.code);
    if (server.authMode === "BEARER_ENV" && !server.authEnvKey) failures.push(`${server.code}: BEARER_ENV requires authEnvKey`);
    if (server.authMode === "NONE" && server.authEnvKey) failures.push(`${server.code}: authEnvKey must not be configured for NONE auth`);
    if (server.allowedToolModes.some((mode) => mode !== "READ")) failures.push(`${server.code}: AI07 first delivery only certifies READ MCP tools`);
    const endpoint = validateMcpEndpoint(server);
    if (!endpoint.allowed) failures.push(`${server.code}: ${endpoint.reasonCode}`);
  }
  return failures;
}
