import { z } from "zod";
import type { AiDataClassification } from "@/lib/ai/types";
import { writeMcpAuditEvent } from "@/lib/ai/mcp/audit";
import { authorizeMcpRequiredPermissions } from "@/lib/ai/mcp/authorization";
import { discoverAndPersistMcpServer } from "@/lib/ai/mcp/discovery";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { authorizeMcpDataBoundary } from "@/lib/ai/mcp/security";
import { callMcpJsonRpc } from "@/lib/ai/mcp/transport";
import type { McpDataClassification } from "@/lib/ai/mcp/types";
import type { AiToolRuntimeContext } from "@/lib/ai/tools/types";
import { rateLimit } from "@/lib/rate-limit";

const bindingSchema = z.object({
  serverCode: z.string().regex(/^[A-Z0-9_]{3,80}$/),
  resourceCode: z.string().regex(/^MCP_RESOURCE_[A-Z0-9_]{3,100}$/),
  remoteUri: z.string().min(1).max(2000),
  enabled: z.boolean().default(false),
  contexts: z.array(z.enum(["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"])).min(1),
  requiredPermissions: z.array(z.string().min(1)).default([]),
  maximumBytes: z.number().int().min(256).max(2_000_000).default(250_000),
}).strict();

type ResourceBinding = z.infer<typeof bindingSchema>;

type ResourceReadResult = {
  contents?: Array<{ uri?: string; mimeType?: string; text?: string; blob?: string }>;
};

function loadResourceBindings(): ResourceBinding[] {
  const raw = process.env.DTSC_MCP_RESOURCE_BINDINGS_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("DTSC_MCP_RESOURCE_BINDINGS_JSON_INVALID_JSON"); }
  const result = z.array(bindingSchema).safeParse(parsed);
  if (!result.success) throw new Error("DTSC_MCP_RESOURCE_BINDINGS_JSON_INVALID_SCHEMA");
  return result.data;
}

export const MCP_RESOURCE_BINDINGS = loadResourceBindings();

function normalizeClassification(value: AiDataClassification): McpDataClassification {
  if (value === "PUBLIC") return "PUBLIC";
  if (value === "INTERNAL") return "INTERNAL";
  if (value === "CONFIDENTIAL") return "CONFIDENTIAL";
  if (value === "SECRET") return "SECRET";
  return "SENSITIVE";
}

function effectiveClassifications(context: AiToolRuntimeContext): McpDataClassification[] {
  if (context.dataClassifications?.length) return context.dataClassifications.map(normalizeClassification);
  const activeContext = context.session.activeContext || "GLOBAL_CLIENT";
  return activeContext === "ORGANIZATION" || activeContext === "DTSC_INTERNAL" ? ["CONFIDENTIAL"] : ["INTERNAL"];
}

function textByteLength(value: string) { return new TextEncoder().encode(value).byteLength; }

export async function readMcpBoundResource(input: { resourceCode: string; context: AiToolRuntimeContext }) {
  const binding = MCP_RESOURCE_BINDINGS.find((entry) => entry.resourceCode === input.resourceCode && entry.enabled);
  if (!binding) throw new Error("MCP_RESOURCE_BINDING_NOT_ACTIVE");
  const server = getMcpServerDefinition(binding.serverCode);
  if (!server || server.status !== "CERTIFIED") throw new Error("MCP_SERVER_NOT_CERTIFIED");
  const activeContext = input.context.session.activeContext || "GLOBAL_CLIENT";
  if (!binding.contexts.includes(activeContext) || !server.contexts.includes(activeContext)) throw new Error("MCP_RESOURCE_CONTEXT_NOT_ALLOWED");
  if (server.organizationScope === "TENANT" && (activeContext !== "ORGANIZATION" || !input.context.organizationId || input.context.session.activeOrganizationId !== input.context.organizationId)) {
    throw new Error("MCP_RESOURCE_TENANT_CONTEXT_REQUIRED");
  }

  const limiter = await rateLimit(`ai-mcp-resource:${input.context.userId}:${server.code}`, 30, 60 * 1000);
  if (!limiter.ok) throw new Error("MCP_RATE_LIMITED");
  const permissionDecision = await authorizeMcpRequiredPermissions({ requiredPermissions: binding.requiredPermissions, context: input.context });
  if (!permissionDecision.allowed) throw new Error(permissionDecision.reasonCode);
  const dataDecision = authorizeMcpDataBoundary({ server, classifications: effectiveClassifications(input.context) });
  if (!dataDecision.allowed) throw new Error(dataDecision.reasonCode);

  const userAuth = server.authMode === "OAUTH_USER"
    ? { userId: input.context.userId, organizationId: input.context.organizationId || "" }
    : null;
  if (server.authMode === "OAUTH_USER" && !userAuth?.organizationId) throw new Error("MCP_OAUTH_ORGANIZATION_CONTEXT_REQUIRED");

  const { snapshot } = await discoverAndPersistMcpServer(server, userAuth);
  if (!snapshot.resources.some((resource) => resource.uri === binding.remoteUri)) throw new Error("MCP_BOUND_RESOURCE_NOT_DISCOVERED");

  const result = await callMcpJsonRpc<ResourceReadResult>({ server, method: "resources/read", params: { uri: binding.remoteUri }, userAuth });
  const contents = (result.contents || []).map((content) => {
    if (content.uri && content.uri !== binding.remoteUri) throw new Error("MCP_RESOURCE_URI_MISMATCH");
    const text = typeof content.text === "string" ? content.text : "";
    if (textByteLength(text) > binding.maximumBytes) throw new Error("MCP_RESOURCE_CONTENT_TOO_LARGE");
    if (content.blob) throw new Error("MCP_RESOURCE_BINARY_NOT_ENABLED_IN_AI07_BASELINE");
    return { uri: content.uri || binding.remoteUri, mimeType: content.mimeType || "text/plain", text };
  });

  await writeMcpAuditEvent({
    userId: input.context.userId,
    organizationId: input.context.organizationId || null,
    serverCode: server.code,
    eventType: "RESOURCE_READ",
    status: "SUCCESS",
    metadata: { resourceCode: binding.resourceCode, remoteUri: binding.remoteUri, discoveryVersion: snapshot.version, contentCount: contents.length },
  });

  return {
    resourceCode: binding.resourceCode,
    serverCode: server.code,
    remoteUri: binding.remoteUri,
    provenance: { protocol: "MCP", discoveryVersion: snapshot.version },
    trust: "UNTRUSTED_EXTERNAL_CONTENT" as const,
    instructionAuthority: "NONE" as const,
    contents,
  };
}

export function assertMcpResourceBindingIntegrity() {
  const failures: string[] = [];
  const codes = new Set<string>();
  for (const binding of MCP_RESOURCE_BINDINGS) {
    if (codes.has(binding.resourceCode)) failures.push(`${binding.resourceCode}: duplicate MCP resource binding`);
    codes.add(binding.resourceCode);
    const server = getMcpServerDefinition(binding.serverCode);
    if (!server) failures.push(`${binding.resourceCode}: unknown MCP server ${binding.serverCode}`);
    else if (binding.enabled && server.status !== "CERTIFIED") failures.push(`${binding.resourceCode}: enabled resource requires CERTIFIED server`);
  }
  return failures;
}
