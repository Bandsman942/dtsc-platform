import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";

export const FINANCE_AI_TOOL_SPECS = [
  { code: "FINANCE_OVERVIEW_READ", moduleCode: "FINANCE_OVERVIEW", description: "Lire l’état de préparation et la configuration financière autorisée de l’entreprise active." },
  { code: "FINANCE_BUDGETS_READ", moduleCode: "FINANCE_BUDGETS", description: "Lire les budgets autorisés, leurs engagements, dépenses approuvées et variances par devise." },
  { code: "FINANCE_RECEIVABLES_READ", moduleCode: "FINANCE_RECEIVABLES", description: "Lire les créances ouvertes, échéances et montants restant dus autorisés." },
  { code: "FINANCE_PAYABLES_READ", moduleCode: "FINANCE_PAYABLES", description: "Lire les dettes fournisseurs ouvertes, échéances et montants restant dus autorisés." },
  { code: "FINANCE_PAYMENTS_READ", moduleCode: "FINANCE_PAYMENTS", description: "Lire les paiements récents et leurs statuts dans l’entreprise active." },
  { code: "FINANCE_TREASURY_READ", moduleCode: "FINANCE_TREASURY", description: "Lire les positions de trésorerie et les flux confirmés récents autorisés." },
  { code: "FINANCE_CASH_READ", moduleCode: "FINANCE_CASH", description: "Lire les positions de caisse et Mobile Money ainsi que les sessions de caisse récentes autorisées." },
  { code: "FINANCE_BANK_READ", moduleCode: "FINANCE_BANK", description: "Lire les positions bancaires et les relevés bancaires récents autorisés." },
  { code: "FINANCE_RECONCILIATION_READ", moduleCode: "FINANCE_RECONCILIATION", description: "Lire la situation de rapprochement et les mouvements encore non rapprochés autorisés." },
  { code: "FINANCE_ACCOUNTING_READ", moduleCode: "FINANCE_ACCOUNTING", description: "Lire une synthèse des écritures comptables postées et des journaux récents autorisés." },
  { code: "FINANCE_TAX_READ", moduleCode: "FINANCE_TAX", description: "Lire une synthèse fiscale calculée depuis les lignes de taxe autorisées." },
  { code: "FINANCE_CLOSE_READ", moduleCode: "FINANCE_CLOSE", description: "Lire les périodes financières et les états de clôture récents autorisés." },
  { code: "FINANCE_STATEMENTS_READ", moduleCode: "FINANCE_STATEMENTS", description: "Lire les états financiers générés ou publiés disponibles sans exporter des snapshots complets." },
  { code: "FINANCE_ASSETS_READ", moduleCode: "FINANCE_ASSETS", description: "Lire une synthèse bornée du registre comptable des immobilisations autorisé." },
  { code: "FINANCE_INVENTORY_READ", moduleCode: "FINANCE_INVENTORY", description: "Lire une synthèse de valorisation du stock par devise et les principales positions autorisées." },
] as const;

export type FinanceAiToolCode = (typeof FINANCE_AI_TOOL_SPECS)[number]["code"];

export const FINANCE_AI_TOOL_CODES = FINANCE_AI_TOOL_SPECS.map((spec) => spec.code) as FinanceAiToolCode[];

export const FINANCE_READ_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    periodDays: { type: "integer", minimum: 1, maximum: 366 },
    limit: { type: "integer", minimum: 1, maximum: 25 },
  },
  additionalProperties: false,
} as const;

export const FINANCE_READ_OUTPUT_JSON_SCHEMA = {
  type: "object",
  required: ["toolName", "label", "status", "summary", "asOf", "data"],
  properties: {
    toolName: { type: "string" },
    label: { type: "string" },
    status: { enum: ["AVAILABLE", "EMPTY"] },
    summary: { type: "string" },
    asOf: { type: "string" },
    data: { type: "object" },
  },
  additionalProperties: false,
} as const;

const financeReadInputSchema = z.object({
  periodDays: z.number().int().min(1).max(366).optional(),
  limit: z.number().int().min(1).max(25).optional(),
}).strict();

const financeReadOutputSchema = z.object({
  toolName: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["AVAILABLE", "EMPTY"]),
  summary: z.string(),
  asOf: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
}).strict();

export const FINANCE_AI_TOOL_DEFINITIONS: AiToolDefinition[] = FINANCE_AI_TOOL_SPECS.map((spec) => ({
  code: spec.code,
  labelKey: `ai.tools.finance.${spec.code}.label`,
  descriptionKey: spec.description,
  inputSchema: FINANCE_READ_INPUT_JSON_SCHEMA,
  outputSchema: FINANCE_READ_OUTPUT_JSON_SCHEMA,
  contexts: ["ORGANIZATION"],
  requiredModuleCodes: [spec.moduleCode],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"],
  mode: "READ",
  requiresConfirmation: false,
  idempotent: false,
  auditLevel: "SENSITIVE",
}));

export const FINANCE_AI_TOOL_INPUT_SCHEMAS = Object.fromEntries(
  FINANCE_AI_TOOL_CODES.map((code) => [code, financeReadInputSchema]),
) as Record<FinanceAiToolCode, typeof financeReadInputSchema>;

export const FINANCE_AI_TOOL_OUTPUT_SCHEMAS = Object.fromEntries(
  FINANCE_AI_TOOL_CODES.map((code) => [code, financeReadOutputSchema]),
) as Record<FinanceAiToolCode, typeof financeReadOutputSchema>;

export const FINANCE_AI_TOOL_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  FINANCE_AI_TOOL_SPECS.map((spec) => [spec.code, spec.description]),
);
