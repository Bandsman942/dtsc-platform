import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import { assertMcpServerRegistryIntegrity, getMcpServerDefinition } from "@/lib/ai/mcp/registry";
import { assertSupportedMcpSchema, hashMcpSchema, mcpJsonSchemaToZod } from "@/lib/ai/mcp/schema";
import type { McpToolBinding } from "@/lib/ai/mcp/types";

const jsonSchema = z.record(z.string(), z.unknown());
const bindingSchema = z.object({
  serverCode: z.string().regex(/^[A-Z0-9_]{3,80}$/),
  remoteToolName: z.string().min(1).max(180),
  dtscToolCode: z.string().regex(/^MCP_[A-Z0-9_]{3,100}$/),
  enabled: z.boolean().default(false),
  certifiedDiscoveryVersion: z.string().regex(/^[a-f0-9]{64}$/),
  inputSchemaHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputSchemaHash: z.string().regex(/^[a-f0-9]{64}$/),
  inputSchema: jsonSchema,
  outputSchema: jsonSchema,
  contexts: z.array(z.enum(["GLOBAL_CLIENT", "COMMUNITY", "DTSC_INTERNAL", "ORGANIZATION"])).min(1),
  requiredModuleCodes: z.array(z.string().min(1)).default([]),
  requiredPermissions: z.array(z.string().min(1)).default([]),
  minimumPlan: z.string().nullable().optional(),
  allowedAssistantCodes: z.array(z.string().min(1)).optional(),
  allowedSectorCodes: z.array(z.string().min(1)).optional(),
  mode: z.literal("READ"),
  requiresConfirmation: z.literal(false),
  timeoutMs: z.number().int().min(500).max(30_000).optional(),
  auditLevel: z.enum(["STANDARD", "SENSITIVE"]).default("STANDARD"),
}).strict();

type ConfiguredBinding = McpToolBinding & {
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  contexts: string[];
  requiredModuleCodes: string[];
  requiredPermissions: string[];
  minimumPlan?: string | null;
  allowedAssistantCodes?: string[];
  allowedSectorCodes?: string[];
  auditLevel: "STANDARD" | "SENSITIVE";
};

function loadConfiguredBindings(): ConfiguredBinding[] {
  const raw = process.env.DTSC_MCP_TOOL_BINDINGS_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DTSC_MCP_TOOL_BINDINGS_JSON_INVALID_JSON");
  }
  const result = z.array(bindingSchema).safeParse(parsed);
  if (!result.success) throw new Error("DTSC_MCP_TOOL_BINDINGS_JSON_INVALID_SCHEMA");
  return result.data;
}

export const MCP_TOOL_BINDINGS: ConfiguredBinding[] = loadConfiguredBindings();

export function getMcpToolBindingByDtscCode(code: string) {
  return MCP_TOOL_BINDINGS.find((binding) => binding.dtscToolCode === code) || null;
}

export function listEnabledMcpToolBindings() {
  return MCP_TOOL_BINDINGS.filter((binding) => binding.enabled);
}

export function listMcpAiToolDefinitions(): AiToolDefinition[] {
  return listEnabledMcpToolBindings().map((binding) => ({
    code: binding.dtscToolCode,
    labelKey: `ai.tools.mcp.${binding.dtscToolCode}.label`,
    descriptionKey: `ai.tools.mcp.${binding.dtscToolCode}.description`,
    inputSchema: binding.inputSchema,
    outputSchema: binding.outputSchema,
    contexts: binding.contexts,
    allowedSectorCodes: binding.allowedSectorCodes,
    requiredModuleCodes: binding.requiredModuleCodes,
    requiredPermissions: binding.requiredPermissions,
    minimumPlan: binding.minimumPlan,
    allowedAssistantCodes: binding.allowedAssistantCodes,
    mode: binding.mode,
    requiresConfirmation: false,
    idempotent: false,
    auditLevel: binding.auditLevel,
  }));
}

export function getMcpBindingInputSchema(code: string) {
  const binding = getMcpToolBindingByDtscCode(code);
  return binding?.enabled ? mcpJsonSchemaToZod(binding.inputSchema) : null;
}

export function getMcpBindingOutputSchema(code: string) {
  const binding = getMcpToolBindingByDtscCode(code);
  return binding?.enabled ? mcpJsonSchemaToZod(binding.outputSchema) : null;
}

export function assertMcpToolBindingIntegrity() {
  const failures: string[] = [...assertMcpServerRegistryIntegrity()];
  const dtscCodes = new Set<string>();
  const remoteKeys = new Set<string>();
  for (const binding of MCP_TOOL_BINDINGS) {
    const server = getMcpServerDefinition(binding.serverCode);
    if (!server) failures.push(`${binding.dtscToolCode}: unknown MCP server ${binding.serverCode}`);
    else {
      if (binding.enabled && server.status !== "CERTIFIED") failures.push(`${binding.dtscToolCode}: enabled binding requires CERTIFIED server`);
      if (!server.allowedToolModes.includes(binding.mode)) failures.push(`${binding.dtscToolCode}: mode is not allowed by MCP server`);
    }
    if (dtscCodes.has(binding.dtscToolCode)) failures.push(`${binding.dtscToolCode}: duplicate DTSC MCP tool code`);
    dtscCodes.add(binding.dtscToolCode);
    const remoteKey = `${binding.serverCode}:${binding.remoteToolName}`;
    if (remoteKeys.has(remoteKey)) failures.push(`${binding.dtscToolCode}: duplicate remote MCP tool binding ${remoteKey}`);
    remoteKeys.add(remoteKey);
    if (binding.mode !== "READ" || binding.requiresConfirmation) failures.push(`${binding.dtscToolCode}: AI07 first delivery is READ-only`);
    if (hashMcpSchema(binding.inputSchema) !== binding.inputSchemaHash) failures.push(`${binding.dtscToolCode}: certified input schema hash mismatch`);
    if (hashMcpSchema(binding.outputSchema) !== binding.outputSchemaHash) failures.push(`${binding.dtscToolCode}: certified output schema hash mismatch`);
    const inputSupport = assertSupportedMcpSchema(binding.inputSchema);
    if (inputSupport) failures.push(`${binding.dtscToolCode}: unsupported input schema (${inputSupport})`);
    const outputSupport = assertSupportedMcpSchema(binding.outputSchema);
    if (outputSupport) failures.push(`${binding.dtscToolCode}: unsupported output schema (${outputSupport})`);
  }
  return failures;
}
