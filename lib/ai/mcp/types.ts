import type { AiToolMode } from "@/lib/ai/tool-registry";

export type McpTransportKind = "STREAMABLE_HTTP";
export type McpServerStatus = "DISABLED" | "CERTIFIED" | "SUSPENDED";
export type McpDataPolicy = "PUBLIC_ONLY" | "BUSINESS_ALLOWED" | "SENSITIVE_CERTIFIED";

export type McpServerDefinition = {
  code: string;
  label: string;
  transport: McpTransportKind;
  endpoint: string;
  allowedHosts: string[];
  contexts: string[];
  organizationScope: "GLOBAL" | "TENANT";
  status: McpServerStatus;
  dataPolicy: McpDataPolicy;
  authMode: "NONE" | "BEARER_ENV";
  authEnvKey?: string | null;
  timeoutMs: number;
  maxResponseBytes: number;
  allowedToolModes: AiToolMode[];
};

export type McpDiscoveredTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown> | null;
};

export type McpDiscoverySnapshot = {
  serverCode: string;
  version: string;
  discoveredAt: string;
  tools: McpDiscoveredTool[];
  resources: Array<{ uri: string; name?: string; mimeType?: string }>;
  prompts: Array<{ name: string; description?: string }>;
};

export type McpToolBinding = {
  serverCode: string;
  remoteToolName: string;
  dtscToolCode: string;
  enabled: boolean;
  certifiedDiscoveryVersion: string;
  inputSchemaHash: string;
  outputSchemaHash: string;
  mode: AiToolMode;
  requiresConfirmation: boolean;
  timeoutMs?: number;
};

export type McpDataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SENSITIVE" | "SECRET";
