import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import type { ManufacturingModuleCode } from "@/lib/enterprise/manufacturing/constants";

export const MANUFACTURING_AI_READ_SPECS = [
  { code: "ERP_MANUFACTURING_OVERVIEW_READ", moduleCode: "MANUFACTURING_OVERVIEW", label: "Vue d’ensemble production", description: "Lire les indicateurs actuels de production, avancement, pénuries, qualité et rebuts autorisés." },
  { code: "ERP_BOM_READ", moduleCode: "BILL_OF_MATERIALS", label: "Nomenclatures", description: "Lire les nomenclatures et composants de production autorisés à partir du catalogue commun." },
  { code: "ERP_PRODUCTION_ORDERS_READ", moduleCode: "PRODUCTION_ORDERS", label: "Ordres de production", description: "Lire les ordres de production, quantités, statuts et rattachements autorisés." },
  { code: "ERP_PRODUCTION_ROUTINGS_READ", moduleCode: "PRODUCTION_ROUTINGS", label: "Gammes de production", description: "Lire les gammes, opérations, centres de travail et temps standards autorisés." },
  { code: "ERP_WORK_CENTERS_READ", moduleCode: "WORK_CENTERS", label: "Centres de travail", description: "Lire les centres de travail, capacités et rattachements autorisés aux sites et actifs communs." },
  { code: "ERP_MATERIAL_REQUIREMENTS_READ", moduleCode: "MATERIAL_REQUIREMENTS", label: "Besoins matières", description: "Lire les besoins matières, consommations, disponibilités, pénuries et achats liés autorisés." },
  { code: "ERP_PRODUCTION_EXECUTION_READ", moduleCode: "PRODUCTION_EXECUTION", label: "Exécution production", description: "Lire le journal d’exécution de production, quantités et temps opérateurs autorisés." },
  { code: "ERP_PRODUCTION_QUALITY_READ", moduleCode: "QUALITY_CONTROL", label: "Contrôle qualité production", description: "Lire les contrôles qualité, résultats et quantités acceptées ou rejetées autorisés." },
  { code: "ERP_PRODUCTION_SCRAP_READ", moduleCode: "SCRAP_WASTE", label: "Rebuts et pertes", description: "Lire les rebuts et pertes de production autorisés et leur impact stock déclaré." },
  { code: "ERP_PRODUCTION_REPORTS_READ", moduleCode: "PRODUCTION_REPORTS", label: "Rapports de production", description: "Lire les indicateurs consolidés de rendement, consommation, qualité, rebuts et temps de production autorisés." },
] as const satisfies ReadonlyArray<{ code: string; moduleCode: ManufacturingModuleCode; label: string; description: string }>;

export type ManufacturingAiReadToolCode = (typeof MANUFACTURING_AI_READ_SPECS)[number]["code"];

const inputSchema = z.object({
  periodDays: z.number().int().min(1).max(366).optional(),
  limit: z.number().int().min(1).max(25).optional(),
}).strict();

const outputSchema = z.object({
  toolName: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["AVAILABLE", "EMPTY"]),
  summary: z.string(),
  asOf: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    periodDays: { type: "integer", minimum: 1, maximum: 366 },
    limit: { type: "integer", minimum: 1, maximum: 25 },
  },
  additionalProperties: false,
} as const;
const OUTPUT_JSON_SCHEMA = { type: "object" } as const;

export const MANUFACTURING_AI_TOOL_INPUT_SCHEMAS = Object.fromEntries(
  MANUFACTURING_AI_READ_SPECS.map((spec) => [spec.code, inputSchema]),
) as Record<ManufacturingAiReadToolCode, typeof inputSchema>;

export const MANUFACTURING_AI_TOOL_OUTPUT_SCHEMAS = Object.fromEntries(
  MANUFACTURING_AI_READ_SPECS.map((spec) => [spec.code, outputSchema]),
) as Record<ManufacturingAiReadToolCode, typeof outputSchema>;

export const MANUFACTURING_AI_TOOL_DESCRIPTIONS = Object.fromEntries(
  MANUFACTURING_AI_READ_SPECS.map((spec) => [spec.code, spec.description]),
) as Record<ManufacturingAiReadToolCode, string>;

export const MANUFACTURING_AI_TOOL_DEFINITIONS: AiToolDefinition[] = MANUFACTURING_AI_READ_SPECS.map((spec) => ({
  code: spec.code,
  labelKey: `ai.tools.manufacturing.${spec.moduleCode.toLowerCase()}.label`,
  descriptionKey: spec.description,
  inputSchema: INPUT_JSON_SCHEMA,
  outputSchema: OUTPUT_JSON_SCHEMA,
  contexts: ["ORGANIZATION"],
  allowedSectorCodes: ["MANUFACTURING"],
  requiredModuleCodes: [spec.moduleCode],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"],
  minimumPlan: spec.moduleCode === "PRODUCTION_REPORTS" ? "ENTERPRISE" : "BUSINESS",
  allowedAssistantCodes: ["ENTERPRISE_GENERAL"],
  mode: "READ",
  requiresConfirmation: false,
  idempotent: false,
  auditLevel: "SENSITIVE",
}));
