export type AiToolMode = "READ" | "PREPARE" | "MUTATE" | "SENSITIVE_MUTATE";

export type AiToolDefinition = {
  code: string;
  labelKey: string;
  descriptionKey: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  contexts: string[];
  requiredModuleCodes: string[];
  requiredPermissions: string[];
  minimumPlan?: string | null;
  mode: AiToolMode;
  requiresConfirmation: boolean;
  idempotent: boolean;
  auditLevel: "STANDARD" | "SENSITIVE";
};

export const AI_TOOL_REGISTRY: AiToolDefinition[] = [
  {
    code: "PHARMACY_LOW_STOCK_READ",
    labelKey: "ai.tools.pharmacyLowStock.label",
    descriptionKey: "ai.tools.pharmacyLowStock.description",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array" },
    contexts: ["ORGANIZATION"],
    requiredModuleCodes: ["ALERTS_EXPIRY_LOW_STOCK"],
    requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ", "PHARMACY.READ"],
    minimumPlan: "BUSINESS",
    mode: "READ",
    requiresConfirmation: false,
    idempotent: true,
    auditLevel: "STANDARD",
  },
  {
    code: "PHARMACY_EXPIRY_READ",
    labelKey: "ai.tools.pharmacyExpiry.label",
    descriptionKey: "ai.tools.pharmacyExpiry.description",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array" },
    contexts: ["ORGANIZATION"],
    requiredModuleCodes: ["BATCH_EXPIRY"],
    requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ", "PHARMACY.READ"],
    minimumPlan: "BUSINESS",
    mode: "READ",
    requiresConfirmation: false,
    idempotent: true,
    auditLevel: "STANDARD",
  },
  {
    code: "TASK_DRAFT_PREPARE",
    labelKey: "ai.tools.taskDraft.label",
    descriptionKey: "ai.tools.taskDraft.description",
    inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, description: { type: "string" } } },
    outputSchema: { type: "object" },
    contexts: ["ORGANIZATION", "DTSC_INTERNAL"],
    requiredModuleCodes: ["TASKS_OPERATIONS"],
    requiredPermissions: ["TASKS.CREATE"],
    minimumPlan: "BUSINESS",
    mode: "PREPARE",
    requiresConfirmation: true,
    idempotent: true,
    auditLevel: "STANDARD",
  },
];

export function getAiToolDefinition(code: string) {
  return AI_TOOL_REGISTRY.find((tool) => tool.code === code) || null;
}

export function assertAiToolRegistryIntegrity() {
  const failures: string[] = [];
  const codes = new Set<string>();
  for (const tool of AI_TOOL_REGISTRY) {
    if (codes.has(tool.code)) failures.push(`Duplicate AI tool: ${tool.code}`);
    codes.add(tool.code);
    if ((tool.mode === "MUTATE" || tool.mode === "SENSITIVE_MUTATE") && !tool.requiresConfirmation) {
      failures.push(`${tool.code}: mutations require confirmation`);
    }
    if ((tool.mode === "MUTATE" || tool.mode === "SENSITIVE_MUTATE") && !tool.idempotent) {
      failures.push(`${tool.code}: mutations must be idempotent`);
    }
  }
  return failures;
}
