import type { AiDataClassification } from "@/lib/ai/types";
import { writeMcpAuditEvent } from "@/lib/ai/mcp/audit";
import { authorizeMcpRequiredPermissions } from "@/lib/ai/mcp/authorization";
import { getMcpToolBindingByDtscCode } from "@/lib/ai/mcp/bindings";
import { discoverAndPersistMcpServer, getDiscoveredMcpTool } from "@/lib/ai/mcp/discovery";
import { getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { buildMcpParameterHeaders, hashMcpSchema } from "@/lib/ai/mcp/schema";
import { authorizeMcpDataBoundary } from "@/lib/ai/mcp/security";
import { callMcpJsonRpc } from "@/lib/ai/mcp/transport";
import type { McpDataClassification } from "@/lib/ai/mcp/types";
import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";

function normalizeClassification(value: AiDataClassification): McpDataClassification {
  if (value === "PUBLIC") return "PUBLIC";
  if (value === "INTERNAL") return "INTERNAL";
  if (value === "CONFIDENTIAL") return "CONFIDENTIAL";
  if (value === "SECRET") return "SECRET";
  return "SENSITIVE";
}

function assertServerContext(input: { organizationScope: "GLOBAL" | "TENANT"; contexts: string[]; context: AiToolRuntimeContext }) {
  const activeContext = input.context.session.activeContext || "GLOBAL_CLIENT";
  if (!input.contexts.includes(activeContext)) throw new Error("MCP_CONTEXT_NOT_ALLOWED");
  if (input.organizationScope === "TENANT") {
    if (activeContext !== "ORGANIZATION" || !input.context.organizationId || input.context.session.activeOrganizationId !== input.context.organizationId) {
      throw new Error("MCP_TENANT_CONTEXT_REQUIRED");
    }
  }
}

type McpToolCallResult = {
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
};

export async function executeMcpBoundTool(input: { dtscToolCode: string; args: unknown; context: AiToolRuntimeContext }) {
  const binding = getMcpToolBindingByDtscCode(input.dtscToolCode);
  if (!binding || !binding.enabled) throw new Error("MCP_TOOL_BINDING_NOT_ACTIVE");
  const server = getMcpServerDefinition(binding.serverCode);
  if (!server || server.status !== "CERTIFIED") throw new Error("MCP_SERVER_NOT_CERTIFIED");

  const auditBase = {
    userId: input.context.userId,
    organizationId: input.context.organizationId || null,
    serverCode: server.code,
    dtscToolCode: binding.dtscToolCode,
    remoteToolName: binding.remoteToolName,
  };

  try {
    if (binding.mode !== "READ" || binding.requiresConfirmation) throw new Error("MCP_AI07_READ_ONLY_POLICY");
    assertServerContext({ organizationScope: server.organizationScope, contexts: server.contexts, context: input.context });

    const permissionDecision = await authorizeMcpRequiredPermissions({ requiredPermissions: binding.requiredPermissions, context: input.context });
    if (!permissionDecision.allowed) throw new Error(permissionDecision.reasonCode);

    const dataDecision = authorizeMcpDataBoundary({
      server,
      classifications: (input.context.dataClassifications || []).map(normalizeClassification),
    });
    if (!dataDecision.allowed) throw new Error(dataDecision.reasonCode);

    const { snapshot } = await discoverAndPersistMcpServer(server);
    const remoteTool = getDiscoveredMcpTool(snapshot, binding.remoteToolName);
    if (!remoteTool) throw new Error("MCP_BOUND_TOOL_NOT_DISCOVERED");
    if (hashMcpSchema(remoteTool.inputSchema) !== binding.inputSchemaHash) throw new Error("MCP_TOOL_INPUT_SCHEMA_CHANGED");
    if (hashMcpSchema(remoteTool.outputSchema || {}) !== binding.outputSchemaHash) throw new Error("MCP_TOOL_OUTPUT_SCHEMA_CHANGED");

    const args = input.args && typeof input.args === "object" ? input.args as Record<string, unknown> : {};
    const result = await callMcpJsonRpc<McpToolCallResult>({
      server: binding.timeoutMs ? { ...server, timeoutMs: Math.min(server.timeoutMs, binding.timeoutMs) } : server,
      method: "tools/call",
      params: { name: binding.remoteToolName, arguments: args },
      additionalHeaders: buildMcpParameterHeaders(remoteTool.inputSchema, args),
    });
    if (result.isError) throw new Error("MCP_REMOTE_TOOL_ERROR");
    await writeMcpAuditEvent({ ...auditBase, eventType: "TOOL_CALL", status: "SUCCESS", metadata: { discoveryVersion: snapshot.version } });
    return result.structuredContent ?? { content: result.content ?? [] };
  } catch (error) {
    const reasonCode = error instanceof Error ? error.message.slice(0, 160) : "MCP_TOOL_EXECUTION_FAILED";
    await writeMcpAuditEvent({ ...auditBase, eventType: "TOOL_CALL", status: reasonCode.includes("FORBIDDEN") || reasonCode.includes("NOT_ALLOWED") || reasonCode.includes("REQUIRED") || reasonCode.includes("PERMISSION") ? "DENIED" : "FAILED", reasonCode });
    throw error;
  }
}

export function getMcpToolExecutor(code: string): AiToolExecutor | null {
  const binding = getMcpToolBindingByDtscCode(code);
  if (!binding?.enabled) return null;
  return ({ args, context }) => executeMcpBoundTool({ dtscToolCode: code, args, context });
}
