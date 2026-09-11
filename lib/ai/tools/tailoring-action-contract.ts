import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import {
  TAILORING_ALTERATION_STATUSES,
  TAILORING_FINISHING_STATUSES,
  TAILORING_FITTING_RESULTS,
} from "@/lib/enterprise/tailoring/constants";

export const TAILORING_AI_ACTION_TOOL_CODES = [
  "ERP_TAILORING_FITTING_COMPLETE",
  "ERP_TAILORING_ALTERATION_UPDATE",
  "ERP_TAILORING_FINISHING_UPDATE",
] as const;
export type TailoringAiActionToolCode = (typeof TAILORING_AI_ACTION_TOOL_CODES)[number];

const optionalNotes = z.string().trim().max(4000).optional().nullable();

export const TAILORING_AI_ACTION_INPUT_SCHEMAS = {
  ERP_TAILORING_FITTING_COMPLETE: z.object({
    fittingId: z.string().trim().min(1).max(180),
    revision: z.number().int().positive(),
    result: z.enum(TAILORING_FITTING_RESULTS).refine((value) => value !== "PENDING", "Le résultat doit être final."),
    notes: optionalNotes,
  }).strict(),
  ERP_TAILORING_ALTERATION_UPDATE: z.object({
    alterationId: z.string().trim().min(1).max(180),
    revision: z.number().int().positive(),
    status: z.enum(TAILORING_ALTERATION_STATUSES),
    notes: optionalNotes,
  }).strict(),
  ERP_TAILORING_FINISHING_UPDATE: z.object({
    productionOrderId: z.string().trim().min(1).max(180),
    garmentBundleId: z.string().trim().min(1).max(180),
    qualityCheckId: z.string().trim().min(1).max(180).optional().nullable(),
    status: z.enum(TAILORING_FINISHING_STATUSES),
    pressed: z.boolean(),
    threadTrimmed: z.boolean(),
    fasteningsChecked: z.boolean(),
    packaged: z.boolean(),
    revision: z.number().int().positive().optional(),
    notes: optionalNotes,
  }).strict().superRefine((data, ctx) => {
    if (data.status === "READY" && !data.qualityCheckId) {
      ctx.addIssue({ code: "custom", path: ["qualityCheckId"], message: "Un contrôle qualité conforme est requis avant READY." });
    }
  }),
} as const;

const actionOutput = z.object({
  entityId: z.string(),
  status: z.string(),
  revision: z.number().int(),
});

export const TAILORING_AI_ACTION_OUTPUT_SCHEMAS = {
  ERP_TAILORING_FITTING_COMPLETE: actionOutput.extend({ result: z.string() }),
  ERP_TAILORING_ALTERATION_UPDATE: actionOutput,
  ERP_TAILORING_FINISHING_UPDATE: actionOutput.extend({ garmentBundleId: z.string(), qualityCheckId: z.string().nullable() }),
} as const;

export const TAILORING_AI_ACTION_DESCRIPTIONS: Record<TailoringAiActionToolCode, string> = {
  ERP_TAILORING_FITTING_COMPLETE: "Clôturer un essayage planifié avec son résultat final. Cette action modifie le parcours atelier et exige une confirmation explicite.",
  ERP_TAILORING_ALTERATION_UPDATE: "Faire progresser une retouche existante dans son workflow autorisé. Cette action exige une confirmation explicite.",
  ERP_TAILORING_FINISHING_UPDATE: "Mettre à jour la finition d’un lot de vêtements. READY exige la checklist complète et un contrôle qualité Manufacturing conforme. Cette action exige une confirmation explicite.",
};

const JSON_SCHEMAS: Record<TailoringAiActionToolCode, Record<string, unknown>> = {
  ERP_TAILORING_FITTING_COMPLETE: { type: "object", required: ["fittingId", "revision", "result"], properties: { fittingId: { type: "string" }, revision: { type: "integer", minimum: 1 }, result: { enum: ["PASS", "ADJUSTMENTS_REQUIRED"] }, notes: { type: ["string", "null"] } }, additionalProperties: false },
  ERP_TAILORING_ALTERATION_UPDATE: { type: "object", required: ["alterationId", "revision", "status"], properties: { alterationId: { type: "string" }, revision: { type: "integer", minimum: 1 }, status: { enum: TAILORING_ALTERATION_STATUSES }, notes: { type: ["string", "null"] } }, additionalProperties: false },
  ERP_TAILORING_FINISHING_UPDATE: { type: "object", required: ["productionOrderId", "garmentBundleId", "status", "pressed", "threadTrimmed", "fasteningsChecked", "packaged"], properties: { productionOrderId: { type: "string" }, garmentBundleId: { type: "string" }, qualityCheckId: { type: ["string", "null"] }, status: { enum: TAILORING_FINISHING_STATUSES }, pressed: { type: "boolean" }, threadTrimmed: { type: "boolean" }, fasteningsChecked: { type: "boolean" }, packaged: { type: "boolean" }, revision: { type: "integer", minimum: 1 }, notes: { type: ["string", "null"] } }, additionalProperties: false },
};

const MODULE_BY_TOOL: Record<TailoringAiActionToolCode, string> = {
  ERP_TAILORING_FITTING_COMPLETE: "TAILORING_FITTINGS",
  ERP_TAILORING_ALTERATION_UPDATE: "TAILORING_ALTERATIONS",
  ERP_TAILORING_FINISHING_UPDATE: "TAILORING_FINISHING",
};

export const TAILORING_AI_ACTION_DEFINITIONS: AiToolDefinition[] = TAILORING_AI_ACTION_TOOL_CODES.map((code) => ({
  code,
  labelKey: `ai.tools.tailoring.${code.toLowerCase()}.label`,
  descriptionKey: TAILORING_AI_ACTION_DESCRIPTIONS[code],
  inputSchema: JSON_SCHEMAS[code],
  outputSchema: { type: "object" },
  contexts: ["ORGANIZATION"],
  allowedSectorCodes: ["MANUFACTURING"],
  requiredModuleCodes: [MODULE_BY_TOOL[code]],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.MUTATE", `enterprise.${MODULE_BY_TOOL[code].toLowerCase()}.write`],
  minimumPlan: "BUSINESS",
  allowedAssistantCodes: ["ENTERPRISE_GENERAL"],
  mode: "MUTATE",
  requiresConfirmation: true,
  idempotent: true,
  auditLevel: "SENSITIVE",
}));
