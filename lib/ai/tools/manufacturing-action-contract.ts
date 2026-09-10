import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";

export const MANUFACTURING_AI_ACTION_TOOL_CODE = "ERP_MANUFACTURING_ORDER_SUBMIT" as const;

export const MANUFACTURING_AI_ACTION_INPUT_SCHEMAS = {
  [MANUFACTURING_AI_ACTION_TOOL_CODE]: z.object({
    orderId: z.string().trim().min(1).max(180),
    revision: z.number().int().positive(),
    approverUserId: z.string().trim().min(1).max(180),
  }).strict(),
} as const;

export const MANUFACTURING_AI_ACTION_OUTPUT_SCHEMAS = {
  [MANUFACTURING_AI_ACTION_TOOL_CODE]: z.object({
    orderId: z.string(),
    reference: z.string(),
    status: z.string(),
    revision: z.number().int(),
    approverUserId: z.string().nullable(),
  }),
} as const;

export const MANUFACTURING_AI_ACTION_DESCRIPTIONS = {
  [MANUFACTURING_AI_ACTION_TOOL_CODE]: "Soumettre un ordre de production existant à un approbateur autorisé. Cette action modifie le workflow de production et exige une confirmation explicite de l’utilisateur.",
} as const;

export const MANUFACTURING_AI_ACTION_DEFINITIONS: AiToolDefinition[] = [{
  code: MANUFACTURING_AI_ACTION_TOOL_CODE,
  labelKey: "ai.tools.manufacturing.orderSubmit.label",
  descriptionKey: MANUFACTURING_AI_ACTION_DESCRIPTIONS[MANUFACTURING_AI_ACTION_TOOL_CODE],
  inputSchema: {
    type: "object",
    required: ["orderId", "revision", "approverUserId"],
    properties: {
      orderId: { type: "string" },
      revision: { type: "integer", minimum: 1 },
      approverUserId: { type: "string" },
    },
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
  contexts: ["ORGANIZATION"],
  allowedSectorCodes: ["MANUFACTURING"],
  requiredModuleCodes: ["PRODUCTION_ORDERS"],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.MUTATE", "enterprise.manufacturing.orders.submit"],
  minimumPlan: "BUSINESS",
  allowedAssistantCodes: ["ENTERPRISE_GENERAL"],
  mode: "MUTATE",
  requiresConfirmation: true,
  idempotent: true,
  auditLevel: "SENSITIVE",
}];
