import { z } from "zod";
import type { McpServerDefinition } from "@/lib/ai/mcp/types";
import { validateMcpEndpoint } from "@/lib/ai/mcp/security";

const envKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const hostSchema = z.string().min(1).max(253).transform((value) => value.toLowerCase());

const serverSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{3,80}$/),
  label: z.string().min(2).max(120),
  transport: z.literal("STREAMABLE_HTTP"),
  endpoint: z.string().url(),
  allowedHosts: z.array(hostSchema).min(1).max(8),
  contexts: z.array(z.enum(["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"])).min(1),
  organizationScope: z.enum(["GLOBAL", "TENANT"]),
  status: z.enum(["DISABLED", "CERTIFIED", "SUSPENDED"]),
  dataPolicy: z.enum(["PUBLIC_ONLY", "BUSINESS_ALLOWED", "SENSITIVE_CERTIFIED"]),
  authMode: z.enum(["NONE", "BEARER_ENV", "OAUTH_USER"]),
  authEnvKey: envKeySchema.nullable().optional(),
  oauthClientIdEnvKey: envKeySchema.nullable().optional(),
  oauthClientSecretEnvKey: envKeySchema.nullable().optional(),
  oauthScopes: z.array(z.string().min(1).max(240)).max(30).optional(),
  oauthAuthorizationServer: z.string().url().nullable().optional(),
  oauthAllowedHosts: z.array(hostSchema).min(1).max(12).optional(),
  timeoutMs: z.number().int().min(500).max(30_000).default(8_000),
  maxResponseBytes: z.number().int().min(1_024).max(5_000_000).default(1_000_000),
  allowedToolModes: z.array(z.enum(["READ", "PREPARE", "MUTATE", "SENSITIVE_MUTATE"])).min(1),
}).strict();

const GOOGLE_OAUTH_HOSTS = ["accounts.google.com", "oauth2.googleapis.com"];

const BUILT_IN_MCP_SERVERS: McpServerDefinition[] = [
  {
    code: "GOOGLE_GMAIL_OFFICIAL",
    label: "Gmail",
    transport: "STREAMABLE_HTTP",
    endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
    allowedHosts: ["gmailmcp.googleapis.com"],
    contexts: ["GLOBAL_CLIENT", "DTSC_INTERNAL", "ORGANIZATION"],
    organizationScope: "GLOBAL",
    status: "CERTIFIED",
    dataPolicy: "BUSINESS_ALLOWED",
    authMode: "OAUTH_USER",
    oauthClientIdEnvKey: "DTSC_MCP_GOOGLE_CLIENT_ID",
    oauthClientSecretEnvKey: "DTSC_MCP_GOOGLE_CLIENT_SECRET",
    oauthScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    oauthAuthorizationServer: "https://accounts.google.com",
    oauthAllowedHosts: ["gmailmcp.googleapis.com", ...GOOGLE_OAUTH_HOSTS],
    timeoutMs: 8_000,
    maxResponseBytes: 1_000_000,
    allowedToolModes: ["READ"],
  },
  {
    code: "GOOGLE_CALENDAR_OFFICIAL",
    label: "Google Calendar",
    transport: "STREAMABLE_HTTP",
    endpoint: "https://calendarmcp.googleapis.com/mcp/v1",
    allowedHosts: ["calendarmcp.googleapis.com"],
    contexts: ["GLOBAL_CLIENT", "DTSC_INTERNAL", "ORGANIZATION"],
    organizationScope: "GLOBAL",
    status: "CERTIFIED",
    dataPolicy: "BUSINESS_ALLOWED",
    authMode: "OAUTH_USER",
    oauthClientIdEnvKey: "DTSC_MCP_GOOGLE_CLIENT_ID",
    oauthClientSecretEnvKey: "DTSC_MCP_GOOGLE_CLIENT_SECRET",
    oauthScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    oauthAuthorizationServer: "https://accounts.google.com",
    oauthAllowedHosts: ["calendarmcp.googleapis.com", ...GOOGLE_OAUTH_HOSTS],
    timeoutMs: 8_000,
    maxResponseBytes: 1_000_000,
    allowedToolModes: ["READ"],
  },
];

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

function mergeServerRegistry() {
  const byCode = new Map(BUILT_IN_MCP_SERVERS.map((server) => [server.code, server]));
  for (const server of loadConfiguredServers()) byCode.set(server.code, server);
  return [...byCode.values()];
}

export const MCP_SERVER_REGISTRY: McpServerDefinition[] = mergeServerRegistry();

export function getMcpServerDefinition(code: string) {
  return MCP_SERVER_REGISTRY.find((server) => server.code === code) || null;
}

export function listCertifiedMcpServers() {
  return MCP_SERVER_REGISTRY.filter((server) => server.status === "CERTIFIED");
}

export function isMcpOAuthPlatformConfigured(server: McpServerDefinition) {
  if (server.authMode !== "OAUTH_USER" || !server.oauthClientIdEnvKey) return false;
  const clientIdConfigured = Boolean(process.env[server.oauthClientIdEnvKey]?.trim());
  const clientSecretConfigured = !server.oauthClientSecretEnvKey || Boolean(process.env[server.oauthClientSecretEnvKey]?.trim());
  return clientIdConfigured && clientSecretConfigured;
}

export function assertMcpServerRegistryIntegrity() {
  const failures: string[] = [];
  const codes = new Set<string>();
  const authEnvKeys = new Map<string, string>();
  for (const server of MCP_SERVER_REGISTRY) {
    if (codes.has(server.code)) failures.push(`${server.code}: duplicate MCP server code`);
    codes.add(server.code);

    if (server.authMode === "BEARER_ENV" && !server.authEnvKey) failures.push(`${server.code}: BEARER_ENV requires authEnvKey`);
    if (server.authMode !== "BEARER_ENV" && server.authEnvKey) failures.push(`${server.code}: authEnvKey is reserved for BEARER_ENV auth`);
    if (server.authMode === "OAUTH_USER" && !server.oauthClientIdEnvKey) failures.push(`${server.code}: OAUTH_USER requires oauthClientIdEnvKey`);
    if (server.authMode === "OAUTH_USER" && !server.oauthAllowedHosts?.length) failures.push(`${server.code}: OAUTH_USER requires oauthAllowedHosts`);
    if (server.authMode !== "OAUTH_USER" && (server.oauthClientIdEnvKey || server.oauthClientSecretEnvKey || server.oauthAuthorizationServer || server.oauthScopes?.length || server.oauthAllowedHosts?.length)) {
      failures.push(`${server.code}: OAuth configuration requires OAUTH_USER auth`);
    }
    if (server.oauthAuthorizationServer) {
      const host = new URL(server.oauthAuthorizationServer).hostname.toLowerCase();
      if (!server.oauthAllowedHosts?.includes(host)) failures.push(`${server.code}: oauthAuthorizationServer host is not certified`);
    }
    if (server.authMode === "BEARER_ENV" && server.authEnvKey) {
      const previousServer = authEnvKeys.get(server.authEnvKey);
      if (previousServer && previousServer !== server.code) failures.push(`${server.code}: authEnvKey is already assigned to ${previousServer}`);
      else authEnvKeys.set(server.authEnvKey, server.code);
    }
    if (server.allowedToolModes.some((mode) => mode !== "READ")) failures.push(`${server.code}: current MCP certification only permits READ tools`);
    const endpoint = validateMcpEndpoint(server);
    if (!endpoint.allowed) failures.push(`${server.code}: ${endpoint.reasonCode}`);
  }
  return failures;
}
